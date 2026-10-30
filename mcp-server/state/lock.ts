const tails = new Map<string, Promise<void>>();

/**
 * Serializes read-modify-save for one player.
 * Different players do not wait on each other.
 */
export function withPlayerLock<T>(playerId: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(playerId) ?? Promise.resolve();
  const run = previous.then(task, task);
  const idle = run.then(() => undefined, () => undefined);
  tails.set(playerId, idle);
  void idle.then(() => {
    if (tails.get(playerId) === idle) tails.delete(playerId);
  });
  return run;
}
