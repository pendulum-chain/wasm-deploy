interface ResourceRecord<T> {
  completed: boolean;
  promise: Promise<T>;
  resolver(value: T): void;
}

type TaskName = string;
type ResourceName = string;

export class DependencySystem<T> {
  tasks: Set<TaskName> = new Set();
  waitingTasks: Record<TaskName, Set<ResourceName>> = {};
  resources: Record<ResourceName, ResourceRecord<T>> = {};
  onStuck: (waitingTasks: Record<TaskName, ResourceName[]> | undefined) => void;

  constructor(onStuck: (waitingTasks: Record<TaskName, ResourceName[]> | undefined) => void) {
    this.onStuck = onStuck;
  }

  public registerTask(task: TaskName): void {
    this.tasks.add(task);
  }

  public removeTask(task: TaskName): void {
    this.tasks.delete(task);
    this.checkStuckState();
  }

  public async get(task: TaskName, resource: ResourceName): Promise<T> {
    this.registerResource(resource);

    if (!this.resources[resource].completed) {
      if (this.waitingTasks[task] === undefined) {
        this.waitingTasks[task] = new Set();
      }
      this.waitingTasks[task].add(resource);
      this.checkStuckState();
    }

    const value = await this.resources[resource].promise;
    if (this.waitingTasks[task] !== undefined) {
      this.waitingTasks[task].delete(resource);
    }

    return value;
  }

  public async getOrNull(resource: ResourceName): Promise<T | null> {
    return this.resources[resource]?.completed ? this.resources[resource].promise : null;
  }

  public provide(resource: ResourceName, value: T): void {
    this.registerResource(resource);
    this.resources[resource].completed = true;
    this.resources[resource].resolver(value);
  }

  private registerResource = (resource: ResourceName) => {
    if (this.resources[resource] !== undefined) {
      return;
    }

    let resolver: (value: T) => void;

    const promise = new Promise<T>((resolve) => {
      resolver = resolve;
    });

    this.resources[resource] = {
      completed: false,
      promise,
      resolver: resolver!,
    };
  };

  private checkStuckState = () => {
    // there is no reliable way to check for stuck tasks because
    // although all tasks are currently waiting for a resource
    // they could currently execute some other asynchronous operations
    const seemsToBeStuck =
      this.tasks.size > 0 &&
      Array.from(this.tasks).every((task) => {
        return Array.from(this.waitingTasks[task] ?? []).some((resource) => {
          return !this.resources[resource]?.completed;
        });
      });

    if (!seemsToBeStuck) {
      this.onStuck(undefined);
    } else {
      const actuallyWaitingTasks: Record<TaskName, ResourceName[]> = {};

      Object.entries(this.waitingTasks).forEach(([task, resources]) => {
        const actualResources = Array.from(resources).filter((resource) => !this.resources[resource]!.completed);
        if (actualResources.length > 0) {
          actuallyWaitingTasks[task] = actualResources;
        }
      });

      this.onStuck(actuallyWaitingTasks);
    }
  };
}
