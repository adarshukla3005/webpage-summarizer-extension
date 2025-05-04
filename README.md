# Universal Summarizer Extension

A lightweight, cross-browser web extension that provides intelligent summaries of any webpage using Google's Gemini API.

## Features

- **One-Click Summarization**: Generate summaries for any webpage with a single click
- **Custom Summary Lengths**: Choose between short, medium, or long summaries
- **Key Point Highlighting**: Automatically highlights important information in the original page
- **Advanced NLP**: Uses Google's Gemini API for high-quality, contextually accurate summaries
- **Cross-Browser Compatibility**: Works on Chrome, Brave, Edge, and other Chromium-based browsers
- **Clean UI**: Modern, intuitive interface with minimal browser impact
- **User Feedback System**: Built-in rating system to improve summarization quality
- **Privacy-Focused**: Clear data handling policies with minimal data storage

## Project Structure

```
/
├── extension/             # Browser extension code
│   ├── manifest.json      # Extension manifest file
│   ├── privacy.html       # Privacy policy page
│   ├── background/        # Background scripts
│   ├── popup/             # Popup UI
│   ├── content/           # Content scripts injected into pages
│   └── icons/             # Extension icons
└── api/                   # FastAPI backend
    ├── main.py            # Main API entry point
    ├── requirements.txt   # Python dependencies
    └── .env.example       # Example environment variables
```

## Installation

### Extension Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/universal-summarizer.git
   ```

2. Open your browser's extension management page:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
   - Edge: `edge://extensions/`

3. Enable "Developer mode"

4. Click "Load unpacked" and select the `extension` folder from this repository

### Backend API Setup

1. Navigate to the `api` folder:
   ```
   cd universal-summarizer/api
   ```

2. Create a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install the required packages:
   ```
   pip install -r requirements.txt
   ```

4. Create a `.env` file based on `.env.example`:
   ```
   cp .env.example .env
   ```

5. Get a Gemini API key from [Google AI Studio](https://ai.google.dev/) and add it to the `.env` file

6. Start the API server:
   ```
   uvicorn main:app --reload
   ```

## Usage

1. Click the Universal Summarizer icon in your browser toolbar
2. Select your preferred summary length (short, medium, or long)
3. Click "Summarize Page"
4. View the generated summary in the popup or on the page
5. Provide feedback on the summary quality if desired

## Development

### Extension Development

- The extension uses standard Web Extension APIs
- The popup interface is built with vanilla HTML, CSS, and JavaScript
- Content scripts handle in-page summarization and highlighting

### API Development

- The backend is built with FastAPI and uses Google's Gemini API for NLP
- Summaries are generated with contextual understanding of the page content
- API endpoints:
  - `POST /api/summarize`: Generates summaries from page content
  - `POST /api/feedback`: Collects user feedback

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Privacy

This extension processes webpage content to generate summaries. Please see the privacy policy in the extension for full details on data handling.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 