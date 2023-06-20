// ensure that some resource can only be acquired by one execution context at any time
export class PromiseMutex {
  private mutexPromise: Promise<void> | undefined = undefined;

  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    while (this.mutexPromise !== undefined) {
      await this.mutexPromise;
    }

    let resolve: (value: void) => void;
    this.mutexPromise = new Promise<void>((_resolve) => (resolve = _resolve));
    try {
      const result = await action();
      return result;
    } finally {
      this.mutexPromise = undefined;
      resolve!();
    }
  }
}
