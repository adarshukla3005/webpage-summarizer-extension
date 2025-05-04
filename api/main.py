import os
from typing import Optional, List, Dict, Any, Union
from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
import httpx
import google.generativeai as genai
from dotenv import load_dotenv
import logging
import json
from datetime import datetime
import uuid
from pathlib import Path
import time

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Configure file paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "api" / "data"
SUMMARIES_FILE = DATA_DIR / "summaries.json"

print(f"[API] Base directory: {BASE_DIR}")
print(f"[API] Data directory: {DATA_DIR}")
print(f"[API] Summaries file: {SUMMARIES_FILE}")

# Ensure data directory exists
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Initialize summaries file if it doesn't exist
if not SUMMARIES_FILE.exists():
    with open(SUMMARIES_FILE, 'w') as f:
        json.dump([], f)
    logger.info(f"Created new summaries.json file at {SUMMARIES_FILE}")
    print(f"[API] Created new summaries file at {SUMMARIES_FILE}")

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY not found in environment variables")
    raise ValueError("GEMINI_API_KEY environment variable is required")

# Configure the Gemini API with the correct version
genai.configure(api_key=GEMINI_API_KEY)

# Set the model configuration
generation_config = {
    "temperature": 0.7,
    "top_p": 0.8,
    "top_k": 40,
    "max_output_tokens": 2048,
}

safety_settings = [
    {
        "category": "HARM_CATEGORY_HARASSMENT",
        "threshold": "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
        "category": "HARM_CATEGORY_HATE_SPEECH",
        "threshold": "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        "threshold": "BLOCK_MEDIUM_AND_ABOVE"
    },
    {
        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
        "threshold": "BLOCK_MEDIUM_AND_ABOVE"
    },
]

logger.info("Starting Universal Summarizer API with Gemini API configuration")

# Initialize FastAPI app
app = FastAPI(
    title="Universal Summarizer API",
    description="API for summarizing web content using Gemini API",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class SummaryResponse(BaseModel):
    title: Optional[str] = None
    main: str
    keyPoints: Optional[List[str]] = None

class SavedSummary(BaseModel):
    id: str
    url: str
    title: Optional[str]
    summary: SummaryResponse
    created_at: str
    length: str

class SummarizeRequest(BaseModel):
    url: str
    title: Optional[str] = None
    content: str
    length: str = Field(default="medium", description="Length of summary: short, medium, or long")
    isSelection: Optional[bool] = Field(default=False, description="Whether the content is a selected portion of text")
    save_history: Optional[bool] = Field(default=True, description="Whether to save this summary to history")

    @validator('length')
    def validate_length(cls, v):
        if v not in ['short', 'medium', 'long']:
            raise ValueError('Length must be one of: short, medium, long')
        return v

    @validator('content')
    def validate_content(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('Content cannot be empty')
        if len(v) > 100000:  # Limit content length to prevent abuse
            raise ValueError('Content is too long (maximum 100,000 characters)')
        return v

    @validator('url')
    def validate_url(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('URL cannot be empty')
        if len(v) > 2000:  # Reasonable URL length limit
            raise ValueError('URL is too long')
        return v

class FeedbackRequest(BaseModel):
    url: str
    rating: int = Field(ge=1, le=5, description="Rating from 1 to 5")
    comment: Optional[str] = None

# Helper functions
def generate_summary_prompt(title: Optional[str], content: str, length: str, is_selection: bool) -> str:
    """Generate prompt for Gemini API based on content and parameters"""
    
    # Determine minimum length based on summary type
    if length == "short":
        min_length = "100 words"
    elif length == "medium":
        min_length = "200 words"
    else:  # long
        min_length = "600 words"
        
    # Build the prompt
    prompt = f"""Provide a detailed summary of the following {"selected text" if is_selection else "web content"}:
    
Title: {title or "Unknown"}

Content:
{content}

Instructions:
1. Create a comprehensive summary with a minimum length of {min_length}.
2. Provide a detailed explanation of the content from start to end, covering all important aspects.
3. Extract 3-5 key points or facts from the content and then explain them in detail.
4. Format the output as JSON with the following structure:
   {{
     "title": "Brief title or main topic",
     "main": "The detailed summary text",
     "keyPoints": ["Key point 1", "Key point 2", "Key point 3", ...]
   }}
5. Ensure the summary is factual and based solely on the provided content.
6. Include specific details, examples, and explanations from the original content.
7. Do not include any markdown formatting in the output.
8. Ensure the JSON is properly formatted and valid.
"""
    
    logger.info(f"Generated prompt for {length} summary")
    return prompt

async def call_gemini_api(prompt: str) -> Dict[str, Any]:
    """Call Gemini API to generate the summary"""
    try:
        model = genai.GenerativeModel(
            model_name='gemini-2.0-flash',
            generation_config=generation_config,
            safety_settings=safety_settings
        )
        
        logger.info("Calling Gemini API with prompt")
        response = model.generate_content(prompt)
        
        if not response or not response.text:
            logger.error("Empty response from Gemini API")
            raise HTTPException(status_code=500, detail="Empty response from Gemini API")
        
        # Extract JSON from response
        response_text = response.text
        logger.info("Received response from Gemini API")
        
        # Check if the response contains a JSON structure
        if '{' in response_text and '}' in response_text:
            # Try to clean up the response if it's not pure JSON
            import json
            import re
            
            # Extract content between first { and last }
            json_match = re.search(r'({.*})', response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
                try:
                    summary_data = json.loads(json_str)
                    logger.info("Successfully parsed JSON response")
                    return summary_data
                except json.JSONDecodeError:
                    logger.warning("Failed to parse JSON directly, attempting to fix common issues")
                    # If direct parsing fails, try to fix common issues
                    json_str = json_str.replace("'", '"')  # Replace single quotes with double quotes
                    try:
                        summary_data = json.loads(json_str)
                        logger.info("Successfully parsed JSON after fixing quotes")
                        return summary_data
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse JSON after fixes: {str(e)}")
                        logger.error(f"Problematic JSON string: {json_str}")
            
        # Fallback if JSON parsing fails
        logger.warning("Using fallback summary format")
        return {
            "title": "Summary",
            "main": response_text[:500],  # Limit to first 500 chars as fallback
            "keyPoints": ["Unable to extract structured data from the response"]
        }
        
    except Exception as e:
        logger.error(f"Error calling Gemini API: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calling Gemini API: {str(e)}")

def load_summaries() -> List[Dict[str, Any]]:
    """Load saved summaries from the JSON file"""
    try:
        if not SUMMARIES_FILE.exists():
            logger.info(f"Summaries file does not exist at {SUMMARIES_FILE}, creating new file")
            with open(SUMMARIES_FILE, 'w') as f:
                json.dump([], f)
            return []
            
        with open(SUMMARIES_FILE, 'r') as f:
            try:
                summaries = json.load(f)
                # Verify it's a list
                if not isinstance(summaries, list):
                    logger.error(f"Summaries file contains invalid data (not a list): {type(summaries)}")
                    print(f"[API] Error: Summaries file contains invalid data, resetting file")
                    with open(SUMMARIES_FILE, 'w') as f:
                        json.dump([], f)
                    return []
                    
                logger.info(f"Loaded {len(summaries)} summaries from file {SUMMARIES_FILE}")
                return summaries
            except json.JSONDecodeError as e:
                logger.error(f"Error parsing summaries file: {str(e)}")
                print(f"[API] JSON parse error in summaries file, creating backup and resetting")
                
                # Backup the corrupt file
                backup_file = SUMMARIES_FILE.with_suffix('.json.corrupt')
                import shutil
                shutil.copy2(SUMMARIES_FILE, backup_file)
                
                # Create a new empty file
                with open(SUMMARIES_FILE, 'w') as f:
                    json.dump([], f)
                return []
    except Exception as e:
        logger.error(f"Error loading summaries: {str(e)}")
        print(f"[API] Error loading summaries: {str(e)}")
        return []

def save_summaries(summaries: List[Dict[str, Any]]) -> bool:
    """Save summaries to the JSON file with backup"""
    if not isinstance(summaries, list):
        logger.error(f"Cannot save summaries: expected list but got {type(summaries)}")
        return False
        
    try:
        # Create backup of existing file if it exists
        if SUMMARIES_FILE.exists():
            backup_file = SUMMARIES_FILE.with_suffix('.json.bak')
            import shutil
            shutil.copy2(SUMMARIES_FILE, backup_file)
            logger.info(f"Created backup of summaries file at {backup_file}")
        
        # Ensure data directory exists
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        
        # Save new summaries with atomic write pattern
        temp_file = SUMMARIES_FILE.with_suffix('.json.tmp')
        with open(temp_file, 'w') as f:
            json.dump(summaries, f, indent=2)
            f.flush()
            os.fsync(f.fileno())  # Force write to disk
            
        # Replace the old file with the new one (more atomic)
        if os.name == 'nt':  # Windows
            if SUMMARIES_FILE.exists():
                os.replace(temp_file, SUMMARIES_FILE)
            else:
                os.rename(temp_file, SUMMARIES_FILE)
        else:  # Unix-like
            os.rename(temp_file, SUMMARIES_FILE)
            
        logger.info(f"Saved {len(summaries)} summaries to file {SUMMARIES_FILE}")
        
        # Verify the file was saved correctly
        if SUMMARIES_FILE.exists():
            file_size = SUMMARIES_FILE.stat().st_size
            logger.info(f"Verified summaries file exists with size {file_size} bytes")
            
            if file_size == 0:
                logger.error("Summaries file has zero size after save!")
                return False
                
            return True
        else:
            logger.error("Summaries file does not exist after save operation!")
            return False
    except Exception as e:
        logger.error(f"Error saving summaries: {str(e)}")
        print(f"[API] Error saving summaries: {str(e)}")
        return False

# Routes
@app.get("/")
async def root():
    logger.info("Root endpoint accessed")
    return {"message": "Universal Summarizer API is running"}

@app.get("/api/status")
async def status():
    """
    Return API status to check if the service is running
    Used by the extension to verify connectivity
    """
    logger.info("Status endpoint accessed - API is running")
    return {
        "status": "online",
        "api_version": "1.0.0",
        "message": "API is operational and ready to process requests"
    }

@app.post("/api/summarize", response_model=Union[SummaryResponse, str])
async def summarize(request: SummarizeRequest):
    """
    Summarize web content using Gemini API
    """
    request_id = str(uuid.uuid4())[:8]  # Short ID for request tracking
    
    logger.info(f"[{request_id}] Summarize endpoint accessed - URL: {request.url}, Length: {request.length}")
    logger.info(f"[{request_id}] Content length: {len(request.content)} characters")
    logger.info(f"[{request_id}] save_history parameter: {request.save_history}")
    
    # Also print to console for immediate visibility
    print(f"[API] [{request_id}] Summarize request for: {request.url}")
    print(f"[API] [{request_id}] Content length: {len(request.content)} chars, Save history: {request.save_history}")
    
    try:
        # Validate content length
        if len(request.content) < 50:
            logger.warning(f"[{request_id}] Content too short for summarization")
            raise HTTPException(
                status_code=400,
                detail="Content is too short for summarization (minimum 50 characters)"
            )
        
        # Generate prompt
        prompt = generate_summary_prompt(
            request.title, 
            request.content, 
            request.length, 
            request.isSelection
        )
        
        # Call Gemini API
        summary = await call_gemini_api(prompt)
        
        # Validate summary structure
        if not isinstance(summary, dict):
            logger.error(f"[{request_id}] Invalid summary structure received from API")
            raise HTTPException(
                status_code=500,
                detail="Invalid summary structure received from API"
            )
        
        required_fields = ['title', 'main']
        missing_fields = [field for field in required_fields if field not in summary]
        if missing_fields:
            logger.error(f"[{request_id}] Missing required fields in summary: {missing_fields}")
            raise HTTPException(
                status_code=500,
                detail=f"Missing required fields in summary: {', '.join(missing_fields)}"
            )
        
        # Create summary object - ALWAYS save regardless of request.save_history
        new_summary = {
            "id": str(uuid.uuid4()),
            "url": request.url,
            "title": request.title or "Untitled Page",
            "summary": summary,
            "created_at": datetime.now().isoformat(),
            "length": request.length,
            "content_preview": request.content[:200] + "..." if len(request.content) > 200 else request.content
        }
        
        # Always save to history, regardless of the request parameter
        logger.info(f"[{request_id}] Saving summary to history with ID: {new_summary['id']}")
        print(f"[API] [{request_id}] Saving summary with ID: {new_summary['id']}")
        
        summaries = load_summaries()
        logger.info(f"[{request_id}] Loaded {len(summaries)} existing summaries")
        
        # Add new summary
        summaries.append(new_summary)
        logger.info(f"[{request_id}] Added new summary with ID: {new_summary['id']}")
        
        # Save updated list
        success = save_summaries(summaries)
        if success:
            logger.info(f"[{request_id}] Successfully saved {len(summaries)} summaries to file")
            print(f"[API] [{request_id}] Successfully saved summary to {SUMMARIES_FILE}")
        else:
            logger.error(f"[{request_id}] Failed to save summaries to file")
            print(f"[API] [{request_id}] FAILED to save summary to {SUMMARIES_FILE}")
        
        # Wait a moment to ensure file operations complete
        time.sleep(0.5)
        
        # Verify the file contains the new summary
        try:
            with open(SUMMARIES_FILE, 'r') as f:
                saved_data = json.load(f)
                saved_ids = [s.get('id') for s in saved_data]
                
                if new_summary['id'] in saved_ids:
                    logger.info(f"[{request_id}] Verified summary is in saved file")
                    print(f"[API] [{request_id}] Verified summary is saved correctly")
                else:
                    logger.error(f"[{request_id}] Summary not found in saved file!")
                    print(f"[API] [{request_id}] ERROR: Summary not found in saved file!")
        except Exception as e:
            logger.error(f"[{request_id}] Error verifying saved summary: {str(e)}")
            print(f"[API] [{request_id}] Error verifying summary: {str(e)}")
        
        # Return the summary
        return summary
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{request_id}] Error in summarize endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/feedback")
async def submit_feedback(request: FeedbackRequest):
    """
    Submit user feedback for summaries
    """
    try:
        # In a production app, you would store this feedback in a database
        logger.info(f"Received feedback: {request.rating} stars for URL: {request.url}")
        
        if request.comment:
            logger.info(f"Comment: {request.comment}")
            
        return {"message": "Feedback received successfully"}
    except Exception as e:
        logger.error(f"Error in feedback endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history", response_model=List[SavedSummary])
async def get_summary_history():
    """
    Get all saved summaries
    """
    try:
        summaries = load_summaries()
        # Sort by date, newest first
        summaries.sort(key=lambda x: x['created_at'], reverse=True)
        logger.info(f"Retrieved {len(summaries)} summaries from history")
        return summaries
    except Exception as e:
        logger.error(f"Error retrieving summary history: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history/{summary_id}", response_model=SavedSummary)
async def get_summary_by_id(summary_id: str):
    """
    Get a specific summary by ID
    """
    try:
        summaries = load_summaries()
        for summary in summaries:
            if summary["id"] == summary_id:
                logger.info(f"Retrieved summary with ID: {summary_id}")
                return summary
        logger.warning(f"Summary not found with ID: {summary_id}")
        raise HTTPException(status_code=404, detail="Summary not found")
    except Exception as e:
        logger.error(f"Error retrieving summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/history/{summary_id}")
async def delete_summary(summary_id: str):
    """
    Delete a specific summary by ID
    """
    try:
        summaries = load_summaries()
        original_length = len(summaries)
        summaries = [s for s in summaries if s["id"] != summary_id]
        
        if len(summaries) == original_length:
            logger.warning(f"Summary not found for deletion: {summary_id}")
            raise HTTPException(status_code=404, detail="Summary not found")
            
        if not save_summaries(summaries):
            raise HTTPException(status_code=500, detail="Failed to save summaries after deletion")
            
        logger.info(f"Successfully deleted summary with ID: {summary_id}")
        return {"message": "Summary deleted successfully"}
    except Exception as e:
        logger.error(f"Error deleting summary: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests"""
    logger.info(f"Request: {request.method} {request.url}")
    response = await call_next(request)
    return response

# Main entry point
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 