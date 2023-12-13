// ensure that some resource can only be acquired by one execution context at any time
export class PromiseMutex {
  private mutexPromise: Promise<void> | undefined = undefined;
  private mutexPromiseResolve: undefined | ((value: void) => void) = undefined;

  async exclusive<T>(action: () => Promise<T>): Promise<T> {
    await this.startExclusive();
    try {
      const result = await action();
      return result;
    } finally {
      this.endExclusive();
    }
  }

  async startExclusive(): Promise<void> {
    while (this.mutexPromise !== undefined) {
      await this.mutexPromise;
    }

    this.mutexPromise = new Promise<void>((resolve) => (this.mutexPromiseResolve = resolve));
  }

  endExclusive(): void {
    this.mutexPromise = undefined;
    if (this.mutexPromiseResolve !== undefined) {
      this.mutexPromiseResolve();
      this.mutexPromiseResolve = undefined;
    }
  }
}
