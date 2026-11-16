/* R6K public review-only: synthetic, in-memory Docker multiplexed log decoder.
 * No transport, no network, no filesystem and no Docker daemon calls.
 * Outputs only re-encoded, marker-only frames; never raw input bytes.
 * Streaming policy is bounded and fail-closed. Not a production Vector proxy.
 */
const MARKER = 'R6F_PUBLIC_SYNTHETIC_ONLY';
const MAX_FRAME_BYTES = 512;
const HEADER = 8;
const MAX_INPUT_CHUNK = 2048;
const MAX_BUFFERED_BYTES = 4096;
const MAX_STREAM_BYTES = 65536;
const MAX_FRAMES = 100;
const MAX_PENDING_FRAMES = 8;
const decoder = new TextDecoder('utf-8', { fatal: true });
const fail = reason => { throw new Error('R6K_BLOCKED_' + reason); };
const timePattern = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z) R6F_PUBLIC_SYNTHETIC_ONLY\n$/;

/** Create a bounded pull-based in-memory decoder; there is no socket or I/O. */
export function createR6KDecoder() {
  let state = 'ACTIVE';
  let buffered = Buffer.alloc(0);
  let pending = [];
  let inputBytes = 0;
  let parsedFrames = 0;
  const zeroize = () => {
    buffered.fill(0);
    buffered = Buffer.alloc(0);
    for (const frame of pending) frame.fill(0);
    pending = [];
  };
  const abort = reason => {
    zeroize();
    state = 'FAILED';
    fail(reason);
  };
  const parse = () => {
    // Do not consume beyond the pending-output window; caller must first drain.
    while (pending.length < MAX_PENDING_FRAMES && buffered.length >= HEADER) {
      const channel = buffered[0];
      if ((channel !== 1 && channel !== 2) || buffered[1] !== 0 ||
          buffered[2] !== 0 || buffered[3] !== 0) abort('HEADER');
      const length = buffered.readUInt32BE(4);
      if (length === 0 || length > MAX_FRAME_BYTES) abort('FRAME_LENGTH');
      if (buffered.length < HEADER + length) break;
      let text;
      try { text = decoder.decode(buffered.subarray(HEADER, HEADER + length)); }
      catch { abort('UTF8'); }
      const m = timePattern.exec(text);
      const date = m ? Date.parse(m[1]) : NaN;
      if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 19) !== m[1].slice(0, 19)) {
        abort('MARKER_OR_TIME');
      }
      const canonical = Buffer.from(m[1] + ' ' + MARKER + '\n', 'utf8');
      const header = Buffer.alloc(HEADER);
      header[0] = channel;
      header.writeUInt32BE(canonical.length, 4);
      const output = Buffer.concat([header, canonical]);
      const rest = Buffer.from(buffered.subarray(HEADER + length));
      buffered.fill(0);
      buffered = rest;
      pending.push(output);
      parsedFrames++;
      if (parsedFrames > MAX_FRAMES) abort('FRAME_COUNT');
    }
  };
  const status = () => Object.freeze({state, pendingFrames: pending.length,
    bufferedBytes: buffered.length, receivedBytes: inputBytes, parsedFrames});
  return Object.freeze({
    push(chunk) {
      if (state !== 'ACTIVE') fail('NOT_ACTIVE');
      if (pending.length >= MAX_PENDING_FRAMES) fail('BACKPRESSURE');
      if (!Buffer.isBuffer(chunk) || chunk.length === 0 || chunk.length > MAX_INPUT_CHUNK) abort('INPUT_TYPE_OR_SIZE');
      if (inputBytes + chunk.length > MAX_STREAM_BYTES ||
          buffered.length + chunk.length > MAX_BUFFERED_BYTES) abort('STREAM_SIZE');
      inputBytes += chunk.length;
      buffered = Buffer.concat([buffered, chunk]);
      parse();
      return status();
    },
    take(limit = MAX_PENDING_FRAMES) {
      if (state !== 'ACTIVE' && state !== 'ENDED') fail('NOT_READABLE');
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PENDING_FRAMES) fail('TAKE_LIMIT');
      const selected = pending.splice(0, limit);
      const result = selected.map(frame => Buffer.from(frame));
      for (const frame of selected) frame.fill(0);
      if (state === 'ACTIVE') parse();
      return result;
    },
    finish() {
      if (state !== 'ACTIVE') fail('NOT_ACTIVE');
      parse();
      if (pending.length >= MAX_PENDING_FRAMES && buffered.length > 0) fail('BACKPRESSURE');
      if (buffered.length > 0) abort('TRUNCATED');
      state = 'ENDED';
      return status();
    },
    cancel() {
      if (state === 'CANCELLED') return status();
      if (state === 'ENDED' || state === 'FAILED') fail('NOT_CANCELLABLE');
      zeroize();
      state = 'CANCELLED';
      return status();
    },
    status
  });
}
