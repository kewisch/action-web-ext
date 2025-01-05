# WhenExit

Execute a function right before the process, or the browser's tab, is about to exit.

## Install

```sh
npm install --save when-exit
```

## Usage

```ts
import whenExit from 'when-exit';

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

process.exit (); // Callback 1 and 2 are called before exiting
```

## License

MIT © Fabio Spampinato
