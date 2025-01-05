
/* IMPORT */

import process from 'node:process';
import {IS_WINDOWS} from './constants';
import Signals from './signals';
import type {Callback, Disposer} from '../types';

/* MAIN */

class Interceptor {

  /* VARIABLES */

  private callbacks = new Set<Callback> ();
  private exited = false;

  /* CONSTRUCTOR */

  constructor () {

    this.hook ();

  }

  /* API */

  exit = ( signal?: string ): void => {

    if ( this.exited ) return;

    this.exited = true;

    for ( const callback of this.callbacks ) {

      callback ();

    }

    if ( signal ) {

      if ( IS_WINDOWS && ( signal !== 'SIGINT' && signal !== 'SIGTERM' && signal !== 'SIGKILL' ) ) { // Windows doesn't support POSIX signals, but Node emulates these 3 signals for us

        process.kill ( process.pid, 'SIGTERM' );

      } else {

        process.kill ( process.pid, signal );

      }

    }

  };

  hook = (): void => {

    process.once ( 'exit', () => this.exit () );

    for ( const signal of Signals ) {

      try {

        process.once ( signal, () => this.exit ( signal ) );

      } catch {

        // Sometimes "process.once" can throw...

      }

    }

  };

  register = ( callback: Callback ): Disposer => {

    this.callbacks.add ( callback );

    return () => {

      this.callbacks.delete ( callback );

    };

  };

}

/* EXPORT */

export default new Interceptor ();
