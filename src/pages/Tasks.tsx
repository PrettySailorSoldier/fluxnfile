import { TaskDashboard } from '@/components/tasks/TaskDashboard';
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog';

export default function Tasks() {
  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold text-foreground">Tasks</h1>
        <CreateTaskDialog />
      </div>
      
      <TaskDashboard />
    </div>
  );
}
