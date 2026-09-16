// Simple Express server that wraps Google Generative AI (Gemini) functionality.
// - Provides endpoints for code review, fixing, complexity analysis, documentation, and conversion.
// - Each endpoint accepts JSON { code, ... } and returns JSON with the AI response.
// - Keep your GEMINI_API_KEY in a .env file at the project root.

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 5000;

// --- Middleware ---
// Enable CORS for local development and parse JSON bodies.
app.use(cors());
app.use(express.json());

// --- Initialize Google Generative AI ---
// Check that API key is set; warn if missing in deployment
if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️ WARNING: GEMINI_API_KEY is not set in environment variables! AI endpoints will fail.');
}

// Create a client using the GEMINI_API_KEY from .env.
// This client is reused for multiple requests to the AI model.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// --- Health Check / Root Endpoints ---
app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        message: 'AI Code Reviewer API is running!',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy' });
});

// --- API Endpoint: /api/review ---
// Purpose: Ask the AI to perform a structured code review.
// Input: JSON { code: string }
// Output: JSON { review: string }
app.post('/api/review', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            // Bad request if no code provided.
            return res.status(400).json({ error: 'Code is required.' });
        }

        // Choose a generative model instance.
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Detailed prompt instructing the model to return a markdown-formatted review.
        const prompt = `
            🧑‍💻 Please act as an expert code reviewer.

            Analyze the following code snippet and provide structured feedback using **markdown formatting** and **emojis** for clarity and engagement.

            Start with:
            - 🧠 **Programming Language**
            - 🌟 **Code Quality Rating** (out of 10)

            Then review the following aspects:

            --- 

            ### 🐞 1. Bugs or Potential Errors
            - Identify any logical, syntactical, or runtime issues.
            - Mention edge cases or undefined behavior.

            --- 

            ### 🐢 2. Performance Issues or Bottlenecks
            - Highlight inefficient operations or resource-heavy logic.
            - Suggest optimizations if applicable.

            --- 

            ### 🎨 3. Adherence to Best Practices and Code Style
            - Evaluate naming conventions, modularity, readability, and formatting.
            - Mention any violations of language-specific idioms or standards.

            --- 

            ### 🛠️ 4. Suggestions for Improvement and Refactoring
            - Recommend cleaner, more maintainable alternatives.
            - Suggest design pattern usage, abstraction, or simplification.

            --- 

            ### 📦 Code Snippet
            \`\`\`
            ${code}
            \`\`\`

            Make the review actionable and presentation-ready. Let’s elevate this code! 🚀
        `;

        // Send prompt and await response
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const reviewText = response.text();

        // Return the raw markdown text from the model.
        res.json({ review: reviewText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to get review from AI model.' });
    }
});

// --- API Endpoint: /api/fix ---
// Purpose: Ask the AI to fix bugs in the submitted code.
// Input: JSON { code: string }
// Output: JSON { fixedCode: string } (only code, no explanation)
app.post('/api/fix', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Code is required.' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Prompt instructs model to reply with only the corrected code in a single code block.
        const prompt = `
            Please act as an expert programmer. 
            Analyze and fix any bugs or logical errors in the following code snippet.
            Your response should ONLY be the corrected code, formatted in a single markdown code block.
            Do not provide any explanation, preamble, or additional text.
            Here is the code to fix:
            \`\`\`
            ${code}
            \`\`\`
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const fixedCodeText = response.text();

        // Clean potential markdown fences from the model output.
        const cleanedCode = fixedCodeText.replace(/```[a-zA-Z0-9+\-]*\n?/g, '').replace(/```/g, '').trim();

        // Return cleaned code string
        res.json({ fixedCode: cleanedCode });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to get fixed code from AI model.' });
    }
});

// --- API Endpoint: /api/complexity ---
// Purpose: Ask the AI to analyze time and space complexity.
// Input: JSON { code: string }
// Output: JSON { analysis: string } (markdown explanation)
app.post('/api/complexity', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Code is required.' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
🧠 Act as a computer science expert specializing in algorithm analysis.

Please analyze the following code snippet and determine its **time and space complexity**.

Provide your answer in **markdown format** using the structure below, and include **emojis** for clarity and engagement:

---

### 📈 Complexity Analysis

- **⏱️ Time Complexity:** State the Big O notation (e.g., O(n), O(n²), O(log n)).
- **🧮 Explanation:** Briefly explain why the code has this time complexity.

- **💾 Space Complexity:** State the Big O notation (e.g., O(1), O(n)).
- **📦 Explanation:** Briefly explain the space requirements of the code.

---

### 📦 Code Snippet
\`\`\`
${code}
\`\`\`

Make the explanation concise, clear, and suitable for technical documentation or presentation. 🚀
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const analysisText = response.text();

        res.json({ analysis: analysisText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to get complexity analysis from AI model.' });
    }
});

// --- API Endpoint: /api/document ---
// Purpose: Ask the AI to generate markdown documentation for the code.
// Input: JSON { code: string }
// Output: JSON { documentation: string } (markdown doc, no code block)
app.post('/api/document', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Code is required.' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        const prompt = `
🧑‍💻 Act as a senior software engineer writing technical documentation.

Analyze the following code and generate **clean, readable documentation** in **markdown format**.

Your response should include the following sections:

---

### 📝 Code Summary
- Provide a brief, one-sentence description of the code's overall purpose.

---

### 📥 Parameters
- List each parameter as a bullet point.
- For each parameter, specify its inferred **{type}** and provide a clear, concise description.
- If there are no parameters, state **"None"**.

---

### ↪️ Returns
- Specify the inferred **{type}** of the return value.
- Provide a clear description of what the return value represents.

---

❗ Do **NOT** include the original code in your response.  
❗ Do **NOT** wrap your response in a markdown code block.

---

### 📦 Code Snippet
\`\`\`
${code}
\`\`\`

Make the explanation concise, clear, and suitable for technical documentation or presentation. 🚀
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const documentedCode = response.text();

        res.json({ documentation: documentedCode });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to generate documentation from AI model.' });
    }
});

// --- API Endpoint: /api/convert ---
// Purpose: Convert code from one language to another.
// Input: JSON { code: string, sourceLanguage: string, targetLanguage: string }
// Output: JSON { convertedCode: string } (the converted source code)
app.post('/api/convert', async (req, res) => {
    try {
        const { code, sourceLanguage, targetLanguage } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Code is required.' });
        }
        if (!sourceLanguage || !targetLanguage) {
            return res.status(400).json({ error: 'Source and target languages are required.' });
        }

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Prompt asks for a precise translation and requests only a single markdown code block.
        const prompt = `
You are a precise code translator. Convert the following ${sourceLanguage} code to ${targetLanguage}.
Respond with ONLY the converted code inside a single markdown code block (no explanations, no extra text).

\`\`\`
${code}
\`\`\`
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let convertedText = response.text();

        // Strip any markdown fences the model might include.
        convertedText = convertedText.replace(/```[a-zA-Z0-9+\-]*\n?/g, '').replace(/```/g, '').trim();

        res.json({ convertedCode: convertedText });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message || 'Failed to convert code.' });
    }
});

// --- Start server ---
app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});

