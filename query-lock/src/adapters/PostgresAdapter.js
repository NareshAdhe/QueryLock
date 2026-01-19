class PostgresAdapter {
    constructor(client) {
        this.client = client;
    }

    async introspect() {
        const sql = this.getIntrospectionQuery();
        const result = await this.query(sql);
        const rows = result.rows;
        const schema = this.getSchema(rows);
        return schema;
    }

    async query(sql, params = []) {
        try {
            const result = await this.client.query(sql, params);
            return result;
        } catch (error) {
            console.error(`[QueryLock] Database Execution Error: ${error.message}`);
            throw error;
        }
    }

    getType() {
        return 'postgres';
    }

    getParameterStyle() {
        return 'numbered';
    }

    getIntrospectionQuery() {
        return `
            SELECT
                table_name,
                column_name,
                data_type,
                is_nullable
            FROM information_schema.columns
            WHERE table_schema='public'
            ORDER BY table_name, ordinal_position;
        `;
    }

    getSchema(rows) {
        let schema = {};

        for (const row of rows) {
            let tableName = row.table_name;
            if (!schema[tableName]) {
                schema[tableName] = {};
            }

            schema[tableName][row.column_name] = {
                type: this.normalizeType(row.data_type),
                nullable: row.is_nullable === "YES"
            };
        }
        return schema;
    }

    normalizeType(sqlType) {
        const t = sqlType.toLowerCase();
        if (t.includes('int') || t.includes('numeric') || t.includes('float')) return 'Number';
        if (t.includes('char') || t.includes('text') || t.includes('uuid')) return 'String';
        if (t.includes('bool')) return 'Boolean';
        if (t.includes('date') || t.includes('time')) return 'Date';
        if (t.includes('json')) return 'JSON';
        return 'String';
    }
}

module.exports = PostgresAdapter;