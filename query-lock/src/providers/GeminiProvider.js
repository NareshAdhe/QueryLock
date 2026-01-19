const { GoogleGenAI } = require("@google/genai");

class GeminiProvider {
    constructor(apiKey, model = 'gemini-2.5-flash') {
        if (!apiKey) throw new Error("Gemini API Key is required");
        this.apiKey = apiKey;
        this.modelName = model;
        this.client = new GoogleGenAI(apiKey);
    }

    /**
     * @param {string} prompt - User's request
     * @param {object} schema - DB Schema
     * @param {string[]} paramNames - ["name", "age"] (Keys from the user's input object)
     * @param {string} operationType - "READ" | "WRITE"
     * @param {string} paramStyle - "numbered" ($1) or "positional" (?)
     */
    async generateSQL(prompt, schema, paramNames = [], operationType = 'READ', dbType = 'postgres') {
        const placeholderExample = dbType === 'postgres' ? '$1, $2' : '?, ?';

        let systemPrompt = `
You are an expert SQL Compiler for a ${dbType.toUpperCase()} database. 
Your goal is to return valid JSON containing executable, raw SQL.

CONTEXT:
- Database Type: ${dbType}
- Schema: ${JSON.stringify(schema)}
- Operation: ${operationType}

CRITICAL RULES:
1. **Output Format**: Return a single JSON object.
2. **SQL Field**: 
   - Must contain RAW executable SQL.
   - NO Markdown (\`\`\`sql).
   - If the request requires multiple statements (like INSERTing 10 rows), write them ALL in the single 'sql' string, separated by semicolons (;).
   - Use correct quoting for ${dbType} (e.g., "table" for Postgres, \`table\` for MySQL).
3. **Parameters**:
   - Use ${placeholderExample} for parameters if provided.
   - If paramNames is empty, hardcode values (especially for seed data).
4. **Explanation**: Brief summary in the 'explanation' JSON field.
`;

        if (paramNames.length > 0) {
            let paramInstructions = '';
            if (paramStyle === 'numbered') {
                paramInstructions = `You MUST use exactly ${paramNames.length} parameter placeholders ($1, $2, ... $${paramNames.length}) in your SQL.
- $1 corresponds to '${paramNames[0]}'
${paramNames.slice(1).map((p, i) => `- $${i + 2} corresponds to '${p}'`).join('\n')}
`;
            } else {
                paramInstructions = `You MUST use exactly ${paramNames.length} positional parameter placeholders (?) in your SQL.
The order of parameters in the query MUST match this order:
${paramNames.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
            }
            systemPrompt += `
IMPORTANT: The user has provided the following parameters in this specific order:
${JSON.stringify(paramNames)}

${paramInstructions}

The user's prompt may refer to these parameters by name (e.g. "users older than age"), by value description (e.g. "users older than the limit"), or using $ syntax. 
You must infer the mapping between the prompt's intent and the provided parameters.
Do not add extra parameters. Do not hardcode values if they should be parameters.
`;
        } else {
            systemPrompt += `
IMPORTANT: The user has NOT provided any parameters. 
You should NOT use any placeholders ($1, etc.) unless you are absolutely sure the user intended to pass them but forgot. 
Prefer hardcoding values if no parameters are provided.
`;
        }

        try {
            const response = await this.client.models.generateContent({
                model: this.modelName,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            sql: { type: "STRING" },
                            explanation: { type: "STRING" },
                            parameters: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        name: { type: "STRING" },
                                        type: { type: "STRING" }
                                    }
                                }
                            }
                        }
                    }
                },
                contents: [
                    {
                        role: "user",
                        parts: [
                            { text: systemPrompt + "\n\nUSER QUERY: " + prompt }
                        ]
                    }
                ]
            });
            let text;
            if (response.text && typeof response.text === 'function') {
                text = response.text();
            } else if (response.candidates && response.candidates.length > 0 && response.candidates[0].content.parts.length > 0) {
                text = response.candidates[0].content.parts[0].text;
            } else {
                console.error("Unexpected Gemini response:", JSON.stringify(response, null, 2));
                throw new Error("Invalid response structure from Gemini");
            }
            return JSON.parse(text);
        } catch (error) {
            console.error("Gemini SQL Generation Failed:", error);
            throw new Error("AI Generation Failed");
        }
    }
}

module.exports = GeminiProvider;