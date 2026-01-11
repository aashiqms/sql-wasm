var path = require('path');
var shell = require('shelljs');
var rutaAntigua = path.resolve(__dirname, '../dist/bundle/sqlite-worker.js');
var rutaNueva = path.resolve(__dirname, '../../projects/sqlite-assembly/src/lib/assets');
shell.mv('-f', rutaAntigua, rutaNueva);
//# sourceMappingURL=moveFolder.js.map