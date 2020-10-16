import {
	Duplex as DuplexStream,
	DuplexOptions as DuplexStreamOption
} from 'stream';

declare const stop: unique symbol;

declare namespace FirstChunkStream {
	interface Options extends Readonly<DuplexStreamOption> {
		/**
		How many bytes you want to buffer.
		*/
		readonly chunkSize: number;
	}

	type StopSymbol = typeof stop;

	type BufferLike = string | Buffer | Uint8Array;

	type TransformFunction = (chunk: Buffer, encoding: string) => Promise<StopSymbol | BufferLike | {buffer: BufferLike, encoding?: string}>;
}

declare class FirstChunkStream extends DuplexStream {
	/**
	Buffer and transform the `n` first bytes of a stream.

	@param options - The options object is passed to the [`Duplex` stream](https://nodejs.org/api/stream.html#stream_class_stream_duplex) constructor allowing you to customize your stream behavior.
	@param transform - Async function that receives the required `options.chunkSize` bytes.

	Note that the buffer can have a smaller length than the required one. In that case, it will be due to the fact that the complete stream contents has a length less than the `options.chunkSize` value. You should check for this yourself if you strictly depend on the length.

	@example
	```
	import * as fs from 'fs';
	import getStream = require('get-stream');
	import FirstChunkStream = require('first-chunk-stream');

	// unicorn.txt => unicorn rainbow
	const stream = fs.createReadStream('unicorn.txt')
		.pipe(new FirstChunkStream({chunkSize: 7}, async (chunk, encoding) => {
			return chunk.toString(encoding).toUpperCase();
		}));

	(async () => {
		const data = await getStream(stream);

		if (data.length < 7) {
			throw new Error('Couldn\'t get the minimum required first chunk length');
		}

		console.log(data);
		//=> 'UNICORN rainbow'
	})();
	```
	*/
	constructor(
		options: FirstChunkStream.Options,
		transform: FirstChunkStream.TransformFunction
	);

	/**
	Symbol used to end the stream early.

	@example
	```
	new FirstChunkStream({chunkSize: 7}, async (chunk, encoding) => {
		return FirstChunkStream.stop;
	});
	```
	*/
	static readonly stop: FirstChunkStream.StopSymbol;
}

export = FirstChunkStream;
