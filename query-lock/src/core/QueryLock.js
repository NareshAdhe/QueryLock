const QueryCache = require('./QueryCache');
const GeminiProvider = require('../providers/GeminiProvider');
const PostgresAdapter = require('../adapters/PostgresAdapter');
const generateSchemaFingerprint = require('../utils/fingerprint');
const generateTypeDefinitions = require('../utils/typeGenerator');

class QueryLock {
    constructor(config) {
        if (!config.db) throw new Error("QueryLock requires a 'db' field.");
        if (!config.db.type) throw new Error("QueryLock: Missing 'type' in db config.")
        if (!config.db.client) throw new Error("QueryLock: Missing 'client' in db config.")
        if (!config.ai) throw new Error("QueryLock requires an 'ai' field.");
        if (!config.ai.apiKey) throw new Error("QueryLock: Missing 'apiKey' in ai config.");
        if (!config.ai.llm) throw new Error("QueryLock: Missing 'llm' in ai config.");
        if (config.db.type === 'postgres') {
            this.db = new PostgresAdapter(config.db.client);
        } else {
            throw new Error(`QueryLock: Database type '${config.db.type}' is not supported yet.`);
        }
        if (config.ai.llm === 'gemini') {
            this.ai = new GeminiProvider(config.ai.apiKey, config.ai?.model);
        } else {
            throw new Error(`QueryLock: AI Provider '${config.ai.llm}' is not supported yet.`);
        }
        this.cache = new QueryCache();
        this.schema = null;
        this.schemaHash = null;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        await this.cache.load();
        this.schema = await this.db.introspect();
        this.schemaHash = generateSchemaFingerprint(this.schema);

        await this.cache.updateMetadata({
            database_type: this.db.getType(),
            schema_fingerprint: this.schemaHash
        })

        await generateTypeDefinitions(this.cache.getQueries());

        this.initialized = true;
    }

    async refreshSchema() {
        try {
            this.schema = await this.db.introspect();
            this.schemaHash = generateSchemaFingerprint(this.schema);

            await this.cache.updateMetadata({
                database_type: this.db.getType(),
                schema_fingerprint: this.schemaHash
            })
        } catch (error) {
            console.error("[QueryLock] Failed to refresh schema:", err.message);
            throw error;
        }
    }

    _parseArgs(args) {
        let params = {};
        let prompt = "";
        for (const arg of args) {
            if (typeof (arg) === "string") {
                prompt = arg.replace(/\s+/g, ' ').trim();
            }
            else if (typeof (arg) === "object" && arg != null) {
                if (Array.isArray(arg)) {
                    throw new Error("[QueryLock] Invalid Argument: Arrays are not allowed. Use named objects: { id: 1 }");
                }
                params = arg;
            }
            else {
                throw new Error(`[QueryLock] Invalid argument type: ${typeof arg}. Expected String or Object.`);
            }
        }
        return { prompt, params };
    }

    async define(queryKey, ...args) {
        const { prompt, params } = this._parseArgs(args);
        return this._execute(queryKey, prompt, params, 'DEFINE');
    }

    async read(queryKey, ...args) {
        const { prompt, params } = this._parseArgs(args);
        return this._execute(queryKey, prompt, params, 'READ');
    }

    async create(queryKey, ...args) {
        const { prompt, params } = this._parseArgs(args);
        return this._execute(queryKey, prompt, params, 'CREATE');
    }

    async update(queryKey, ...args) {
        const { prompt, params } = this._parseArgs(args);
        return this._execute(queryKey, prompt, params, 'UPDATE');
    }

    async delete(queryKey, ...args) {
        const { prompt, params } = this._parseArgs(args);
        return this._execute(queryKey, prompt, params, 'DELETE');
    }

    async _execute(queryKey, prompt, params, operationType) {
        if (!this.initialized) await this.init();
        let paramNames = [];
        let paramValues = [];

        paramNames = Object.keys(params);
        paramValues = paramNames.map(key => params[key]);

        let queryData = this.cache.get(queryKey);
        let querySQL = "";
        if (!queryData) {
            if (!prompt) {
                throw new Error(`[QueryLock] Cache miss for '${queryKey}' and no prompt provided. Cannot generate SQL.`);
            }
            else {
                console.log(`[QueryLock] Cache miss for '${queryKey}'. Asking AI...`);
                querySQL = await this._generateAndCache(queryKey, prompt, paramNames, operationType);
            }
        }
        else {
            if (prompt && !queryData.prompt) {
                queryData.prompt = prompt;
                this.cache.set(queryKey, queryData);
                await this.cache.save();
            }
            if (queryData.schemaHash !== this.schemaHash) {
                console.warn(`[QueryLock] ⚠️ Schema changed since '${queryKey}' was generated. Auto-healing...`);
                const promptToUse = prompt || queryData.prompt;
                if (promptToUse) {
                    try {
                        console.warn(`
[QueryLock] ⚠️  WARNING: Query '${queryKey}' was auto-healed due to schema drift.
The database schema has changed, please verify that these parameters are still semantically correct for the new schema.
`);
                        querySQL = await this._generateAndCache(queryKey, promptToUse, paramNames, operationType);
                        console.log(`[QueryLock] ✅ Auto-healed '${queryKey}' successfully.`);
                    } catch (err) {
                        throw new Error(`[QueryLock] Auto-heal failed: ${err.message}.`);
                    }
                }
                else {
                    throw new Error(`[QueryLock] Cannot heal '${queryKey}': No prompt available.`);
                }
            }
            else {
                querySQL = queryData.sql;
            }
        }
        try {
            const result = await this.db.query(querySQL, paramValues);

            if (operationType === 'DEFINE') {
                console.log("[QueryLock] 🏗️ Schema change detected. Refreshing context...");
                await this.refreshSchema();
            }

            return result;
        } catch (error) {
            console.error(`[QueryLock] Database Execution Error in '${queryKey}': ${error.message}`);
            throw error;
        }
    }

    async _generateAndCache(queryKey, prompt, paramNames, operationType) {
        const dbType = this.db.getType();
        const aiResponse = await this.ai.generateSQL(prompt, this.schema, paramNames, operationType, dbType);

        const queryData = {
            sql: aiResponse.sql,
            explanation: aiResponse.explanation,
            parameters: aiResponse.parameters,
            prompt,
            paramNames,
            operationType,
            schemaHash: this.schemaHash,
            createdAt: new Date().toISOString(),
            lastExecuted: new Date().toISOString()
        }

        this.cache.set(queryKey, queryData);

        await this.cache.save();

        await generateTypeDefinitions(this.cache.getQueries());

        return queryData.sql;
    }
}

module.exports = QueryLock;