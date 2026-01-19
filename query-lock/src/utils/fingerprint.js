const crypto = require('crypto');

function generateSchemaFingerprint(schema) {
    const sortedKey = Object.keys(schema).sort();
    const sortedSchema = {};
    for (const key of sortedKey){
        sortedSchema[key] = schema[key];
    }
    const str = JSON.stringify(sortedSchema);
    return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = generateSchemaFingerprint;