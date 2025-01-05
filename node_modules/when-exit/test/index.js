
/* IMPORT */

import onExit from '../dist/node/index.js';

/* MAIN */

//TODO: This module should really be tested better than this

onExit ( () => {

  console.log ( 'Callback 1' );

});

onExit ( () => {

  console.log ( 'Callback 2' );

});

const disposer = onExit ( () => {

  console.log ( 'Callback 3' );

});

disposer ();

console.log ( 'Ready' );

setTimeout ( () => {

  process.exit ();
  // process.kill ( process.pid, 'SIGTERM' );

}, 2000 );
