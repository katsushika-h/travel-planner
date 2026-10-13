/**
 * Runs async tasks one at a time in call order. A rejected task does not block later ones.
 * Item saves go through one queue so concurrent schedule PATCHes cannot interleave their
 * server-side dayOrder compaction.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}
