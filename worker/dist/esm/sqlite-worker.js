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
const log = (...args) => console.log(...args);
const error = (...args) => console.error(...args);
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
            sqlite3InitModule({
                print: log,
                printErr: error,
            }).then((sqlite3) => {
                try {
                    dbs[sqliteMessage.filename] = new sqlite3.oo1.OpfsDb(sqliteMessage.filename, sqliteMessage.flags);
                }
                catch (err) {
                    sqliteMessage.error = err;
                }
                finally {
                    self.postMessage(sqliteMessage);
                }
            });
        }
        catch (err) {
            sqliteMessage.error = err;
            self.postMessage(sqliteMessage);
        }
    }
    if (sqliteMessage.type === 'executeSql') {
        try {
            if (!dbs[sqliteMessage.filename]) {
                throw new Error('Initialize the database before performing queries');
            }
            const values = [];
            if (!sqliteMessage.param) {
                sqliteMessage.param = [];
            }
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
            if (!dbs[sqliteMessage.filename]) {
                throw new Error('Initialize the database before performing queries');
            }
            dbs[sqliteMessage.filename].exec('BEGIN TRANSACTION');
            let changes = 0;
            sqliteMessage.sqls.forEach(([sql, param]) => {
                if (!param) {
                    param = [];
                }
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
});
//# sourceMappingURL=sqlite-worker.js.map