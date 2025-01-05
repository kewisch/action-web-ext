
/* IMPORT */

import type {Callback, Disposer} from '../types';

/* MAIN */

class Interceptor {

  /* VARIABLES */

  private callbacks = new Set<Callback> ();

  /* CONSTRUCTOR */

  constructor () {

    this.hook ();

  }

  /* API */

  exit = (): void => {

    for ( const callback of this.callbacks ) {

      callback ();

    }

  };

  hook = (): void => {

    window.addEventListener ( 'beforeunload', this.exit );

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
