export class PromiseMutex {
  private mutexPromise: Promise<void> | undefined = undefined;

  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    while (this.mutexPromise !== undefined) {
      await this.mutexPromise;
    }

    let resolve: (value: void) => void;
    this.mutexPromise = new Promise<void>((_resolve) => (resolve = _resolve));
    const result = await action();
    this.mutexPromise = undefined;
    resolve!();

    return result;
  }
}
