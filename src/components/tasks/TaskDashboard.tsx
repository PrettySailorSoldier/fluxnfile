import { useState } from 'react';
import { useTasks, useMyTasks, useUpdateTask, useDeleteTask, taskTypeLabels, Task, TaskType, TaskStatus } from '@/hooks/useTasks';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Check, 
  Clock, 
  Camera, 
  Sparkles, 
  DollarSign, 
  Upload, 
  Package, 
  Truck, 
  MapPin, 
  MessageSquare,
  Trash2,
  ChevronRight
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

const iconMap: Record<string, React.ElementType> = {
  Camera,
  Sparkles,
  DollarSign,
  Upload,
  Package,
  Truck,
  MapPin,
  MessageSquare,
};

function TaskCard({ task, onComplete, onDelete }: { 
  task: Task; 
  onComplete: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const taskInfo = taskTypeLabels[task.task_type];
  const Icon = iconMap[taskInfo.icon] || Clock;

  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'completed';

  return (
    <Card className={`${isOverdue ? 'border-destructive' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={task.status === 'completed' ? 'secondary' : 'default'}>
                {taskInfo.label}
              </Badge>
              {isOverdue && (
                <Badge variant="destructive">Overdue</Badge>
              )}
            </div>
            
            {task.item && (
              <p 
                className="font-medium truncate cursor-pointer hover:text-primary"
                onClick={() => navigate(`/item/${task.item?.id}`)}
              >
                {task.item.title || 'Untitled Item'}
                <ChevronRight className="w-4 h-4 inline" />
              </p>
            )}
            
            {task.notes && (
              <p className="text-sm text-muted-foreground line-clamp-2">{task.notes}</p>
            )}
            
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {task.deadline && (
                <span>Due: {format(new Date(task.deadline), 'MMM d, h:mm a')}</span>
              )}
              {task.assignee && (
                <span>Assigned to: {task.assignee.full_name || 'Team member'}</span>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            {task.status !== 'completed' && (
              <Button size="icon" variant="ghost" onClick={onComplete}>
                <Check className="w-4 h-4" />
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TaskDashboard() {
  const { user } = useAuth();
  const { data: allTasks = [] } = useTasks();
  const { data: myTasks = [] } = useMyTasks();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const handleComplete = async (taskId: string) => {
    await updateTask.mutateAsync({ id: taskId, status: 'completed' as TaskStatus });
  };

  const handleDelete = async (taskId: string) => {
    await deleteTask.mutateAsync(taskId);
  };

  const pendingTasks = allTasks.filter(t => t.status !== 'completed');
  const completedTasks = allTasks.filter(t => t.status === 'completed');
  const theirTasks = pendingTasks.filter(t => t.assigned_to && t.assigned_to !== user?.id);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="mine">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="mine">
            My Tasks ({myTasks.length})
          </TabsTrigger>
          <TabsTrigger value="team">
            Team ({theirTasks.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Done ({completedTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mine" className="space-y-3 mt-4">
          {myTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No tasks assigned to you
              </CardContent>
            </Card>
          ) : (
            myTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={() => handleComplete(task.id)}
                onDelete={() => handleDelete(task.id)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="team" className="space-y-3 mt-4">
          {theirTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No tasks assigned to team members
              </CardContent>
            </Card>
          ) : (
            theirTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={() => handleComplete(task.id)}
                onDelete={() => handleDelete(task.id)}
              />
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3 mt-4">
          {completedTasks.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                No completed tasks
              </CardContent>
            </Card>
          ) : (
            completedTasks.slice(0, 10).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={() => {}}
                onDelete={() => handleDelete(task.id)}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
