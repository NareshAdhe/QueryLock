const fs = require('fs-extra')
const path = require('path');

class QueryCache {
    constructor() {
        const projectRoot = this._findProjectRoot(process.cwd());
        this.lockfilePath = path.resolve(projectRoot, 'query-lock.json');
        this.cache = {
            version: "1.0.0",
            metadata: {},
            queries: {}
        }
        this.loaded = false;
    }

    _findProjectRoot(startDir) {
        let currentDir = startDir;
        const maxDepth = 5;
        let depth = 0;

        while (depth < maxDepth) {
            if (fs.existsSync(path.join(currentDir, 'package.json'))) {
                return currentDir;
            }

            const parentDir = path.dirname(currentDir);

            if (parentDir === currentDir) {
                break;
            }
            
            currentDir = parentDir;
            depth++;
        }
        return startDir; 
    }

    async load() {
        try {
            const pathExists = await fs.pathExists(this.lockfilePath);
            if (pathExists) {
                const fileData = await fs.readJson(this.lockfilePath);
                this.cache = {
                    ...this.cache,
                    ...fileData,
                    queries: {
                        ...this.cache.queries,
                        ...(fileData.queries || {})
                    }
                };
            }
            this.loaded = true;
        } catch (err) {
            console.error("[QueryLock]: ❌ Failed to load lockfile.", err.message);
        }
    }

    async save() {
        this._ensureLoaded();
        try {
            await fs.writeJson(this.lockfilePath, this.cache, { spaces: 2 });
        } catch (err) {
            console.error("[QueryLock]: ❌ Failed to save lockfile:", err.message);
        }
    }

    get(key) {
        this._ensureLoaded();
        return this.cache.queries[key];
    }

    set(key, data) {
        this._ensureLoaded();
        this.cache.queries[key] = {
            ...data,
            lastExecuted: new Date().toISOString()
        };
    }

    has(key) {
        this._ensureLoaded();
        return Object.prototype.hasOwnProperty.call(this.cache.queries, key);
    }

    getQueries() {
        return this.cache.queries;
    }

    updateMetadata(meta) {
        this._ensureLoaded();
        this.cache.metadata = { ...this.cache.metadata, ...meta };
        return this.save();
    }

    _ensureLoaded() {
        if (!this.loaded) {
            throw new Error("QueryLock Cache not loaded. Call await .load() first.");
        }
    }
}

module.exports = QueryCache;