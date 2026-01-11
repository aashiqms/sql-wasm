var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { default as sqlite3InitModule } from '@sqlite.org/sqlite-wasm';
const dbs = {};
const dbKeys = {};
const log = (...args) => console.log(...args);
const error = (...args) => console.error(...args);
function verifyPasswordAction(filename, password) {
    return __awaiter(this, void 0, void 0, function* () {
        const db = dbs[filename];
        if (!db)
            throw new Error('Database not initialized');
        const check = db.exec({
            sql: "SELECT salt, verifier FROM _security WHERE id = 1",
            returnValue: 'resultRows'
        });
        if (check.length === 0)
            return true;
        if (!password) {
            throw new Error("Password required for this action.");
        }
        const row = check[0];
        const saltHex = row[0];
        const storedVerifier = row[1];
        const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const actionKey = yield deriveKey(password, salt);
        try {
            const dec = yield decryptData(storedVerifier, actionKey);
            return dec === "VERIFIED";
        }
        catch (e) {
            throw new Error("Invalid Password.");
        }
    });
}
function deriveKey(password, salt) {
    return __awaiter(this, void 0, void 0, function* () {
        const enc = new TextEncoder();
        const keyMaterial = yield crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
        return crypto.subtle.deriveKey({
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256"
        }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
}
function encryptData(text, key) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!text)
            return text;
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = enc.encode(text);
        const ciphertext = yield crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);
        const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ciphertext), iv.length);
        return btoa(String.fromCharCode(...combined));
    });
}
function decryptData(base64, key) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!base64)
            return base64;
        try {
            const binaryString = atob(base64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const iv = bytes.slice(0, 12);
            const ciphertext = bytes.slice(12);
            const decrypted = yield crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ciphertext);
            const dec = new TextDecoder();
            return dec.decode(decrypted);
        }
        catch (e) {
            throw new Error("Decryption failed. Wrong password or corrupted data.");
        }
    });
}
self.onmessage = (messageEvent) => __awaiter(void 0, void 0, void 0, function* () {
    const sqliteMessage = messageEvent.data;
    const stringifyParamObjects = (arr) => {
        for (let i = 0; i < arr.length; i++) {
            if (typeof arr[i] !== 'number' && typeof arr[i] !== 'string') {
                arr[i] = String(arr[i]);
            }
        }
    };
    if (sqliteMessage.type === 'init') {
        try {
            if (dbs[sqliteMessage.filename]) {
                throw new Error('The database has already been initialized');
            }
            const sqlite3 = yield sqlite3InitModule({
                print: log,
                printErr: error,
            });
            try {
                const db = new sqlite3.oo1.OpfsDb(sqliteMessage.filename, sqliteMessage.flags);
                dbs[sqliteMessage.filename] = db;
                if (sqliteMessage.password) {
                    db.exec('CREATE TABLE IF NOT EXISTS _security (id INTEGER PRIMARY KEY, salt TEXT, verifier TEXT)');
                    const existingSecurity = db.exec({
                        sql: 'SELECT * FROM _security WHERE id = 1',
                        returnValue: 'resultRows'
                    });
                    let key;
                    if (existingSecurity.length === 0) {
                        const salt = crypto.getRandomValues(new Uint8Array(16));
                        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
                        key = yield deriveKey(sqliteMessage.password, salt);
                        const verifier = yield encryptData("VERIFIED", key);
                        db.exec({
                            sql: 'INSERT INTO _security (id, salt, verifier) VALUES (1, ?, ?)',
                            bind: [saltHex, verifier]
                        });
                    }
                    else {
                        const row = existingSecurity[0];
                        const saltHex = row[1];
                        const storedVerifier = row[2];
                        const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
                        key = yield deriveKey(sqliteMessage.password, salt);
                        try {
                            const check = yield decryptData(storedVerifier, key);
                            if (check !== "VERIFIED")
                                throw new Error();
                        }
                        catch (e) {
                            delete dbs[sqliteMessage.filename];
                            throw new Error("Invalid Password: Access Denied");
                        }
                    }
                    dbKeys[sqliteMessage.filename] = key;
                    db.createFunction({
                        name: 'ENCRYPT',
                        xFunc: (_ptr, arg) => {
                            throw new Error("Please use application-level encryption helper or ensure `sqlite-wasm` supports async UDFs.");
                        }
                    });
                }
                else {
                    const check = db.exec({
                        sql: "SELECT name FROM sqlite_master WHERE type='table' AND name='_security'",
                        returnValue: 'resultRows'
                    });
                    if (check.length > 0) {
                        delete dbs[sqliteMessage.filename];
                        throw new Error("This database is password protected. Please provide a password.");
                    }
                }
            }
            catch (err) {
                sqliteMessage.error = err;
            }
            finally {
                self.postMessage(sqliteMessage);
            }
        }
        catch (err) {
            sqliteMessage.error = err;
            self.postMessage(sqliteMessage);
        }
    }
    const checkAccess = (filename) => {
        if (!dbs[filename]) {
            throw new Error('Database not initialized or Access Denied');
        }
    };
    if (sqliteMessage.type === 'executeSql') {
        try {
            checkAccess(sqliteMessage.filename);
            const values = [];
            if (!sqliteMessage.param)
                sqliteMessage.param = [];
            stringifyParamObjects(sqliteMessage.param);
            dbs[sqliteMessage.filename].exec({
                sql: sqliteMessage.sql,
                bind: sqliteMessage.param,
                rowMode: 'object',
                callback: (row) => {
                    values.push(row);
                }
            });
            sqliteMessage.rows = values;
        }
        catch (e) {
            sqliteMessage.error = e;
        }
        finally {
            self.postMessage(sqliteMessage);
        }
    }
    if (sqliteMessage.type === 'batchSql') {
        try {
            checkAccess(sqliteMessage.filename);
            dbs[sqliteMessage.filename].exec('BEGIN TRANSACTION');
            let changes = 0;
            sqliteMessage.sqls.forEach(([sql, param]) => {
                if (!param)
                    param = [];
                stringifyParamObjects(param);
                dbs[sqliteMessage.filename].exec({ sql: sql, bind: param });
                changes += dbs[sqliteMessage.filename].changes();
            });
            dbs[sqliteMessage.filename].exec('COMMIT');
            sqliteMessage.rowsAffected = changes;
        }
        catch (e) {
            dbs[sqliteMessage.filename].exec('ROLLBACK');
            sqliteMessage.error = e;
        }
        finally {
            self.postMessage(sqliteMessage);
        }
    }
    if (sqliteMessage.type === 'batchReturnSql') {
        try {
            checkAccess(sqliteMessage.filename);
            if (!dbs[sqliteMessage.filename]) {
                throw new Error('Initialize the database before performing queries');
            }
            dbs[sqliteMessage.filename].exec('BEGIN TRANSACTION');
            const batchResults = [];
            sqliteMessage.sqls.forEach(([sql, param]) => {
                if (!param) {
                    param = [];
                }
                stringifyParamObjects(param);
                const currentQueryRows = [];
                dbs[sqliteMessage.filename].exec({
                    sql: sql,
                    bind: param,
                    rowMode: 'object',
                    callback: (row) => {
                        currentQueryRows.push(row);
                    }
                });
                batchResults.push(currentQueryRows);
            });
            dbs[sqliteMessage.filename].exec('COMMIT');
            sqliteMessage.rows = batchResults;
        }
        catch (e) {
            dbs[sqliteMessage.filename].exec('ROLLBACK');
            sqliteMessage.error = e;
        }
        finally {
            self.postMessage(sqliteMessage);
        }
    }
    if (sqliteMessage.type === 'export') {
        debugger;
        yield verifyPasswordAction(sqliteMessage.filename, sqliteMessage.password);
        try {
            if (!dbs[sqliteMessage.filename]) {
                throw new Error('Database not initialized');
            }
            dbs[sqliteMessage.filename].exec('PRAGMA wal_checkpoint(FULL)');
            const root = yield navigator.storage.getDirectory();
            const cleanFilename = sqliteMessage.filename.startsWith('/')
                ? sqliteMessage.filename.slice(1)
                : sqliteMessage.filename;
            const fileHandle = yield root.getFileHandle(cleanFilename);
            const fileBlob = yield fileHandle.getFile();
            const arrayBuffer = yield fileBlob.arrayBuffer();
            sqliteMessage.rows = arrayBuffer;
        }
        catch (e) {
            sqliteMessage.error = e;
        }
        finally {
            if (sqliteMessage.rows) {
                self.postMessage(sqliteMessage);
            }
            else {
                self.postMessage(sqliteMessage);
            }
        }
    }
});
//# sourceMappingURL=sqlite-worker.js.map