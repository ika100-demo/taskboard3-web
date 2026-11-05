import { TaskBoard } from "./_components/task-board";
import { listTasks } from "./_lib/tasks-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await listTasks();
  return (
    <div className="task-page">
      <h1>Tasks</h1>
      <TaskBoard initialTasks={result.ok ? result.tasks : null} />
    </div>
  );
}
