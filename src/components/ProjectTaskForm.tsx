import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Field } from "./Primitives";
import { Tokens } from "../lib/tokens";
import { Project, Task } from "../types/app";

export function ProjectTaskForm({
  tokens,
  projects,
  tasks,
  initialProjectId,
  onSubmit,
  submitLabel,
}: {
  tokens: Tokens;
  projects: Project[];
  tasks: Task[];
  initialProjectId?: string;
  submitLabel: string;
  onSubmit: (value: { projectId: string; taskId?: string; newTaskName?: string }) => void;
}) {
  const activeProjects = projects.filter((project) => !project.archived_at);
  const [projectId, setProjectId] = useState(initialProjectId ?? activeProjects[0]?.id ?? "");
  const [taskText, setTaskText] = useState("");
  const projectTasks = useMemo(
    () => tasks.filter((task) => task.project_id === projectId && !task.archived_at),
    [projectId, tasks],
  );
  const matchingTask = projectTasks.find(
    (task) => task.name.toLowerCase() === taskText.trim().toLowerCase(),
  );
  const canStart = Boolean(projectId && taskText.trim());

  return (
    <Card tokens={tokens} style={{ gap: 12 }}>
      <View style={{ gap: 6 }}>
        <Text style={{ color: tokens.fg2, fontSize: 12, fontWeight: "700" }}>Project</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {activeProjects.map((project) => (
            <Button
              key={project.id}
              tokens={tokens}
              label={project.name}
              variant={project.id === projectId ? "primary" : "secondary"}
              onPress={() => setProjectId(project.id)}
            />
          ))}
        </View>
      </View>
      <Field
        tokens={tokens}
        label="Task"
        value={taskText}
        onChangeText={setTaskText}
        placeholder={projectTasks.length ? "Choose or type a task" : "Create the first task"}
      />
      {taskText.trim() && !matchingTask ? (
        <Text style={{ color: tokens.fg3, fontSize: 12 }}>
          “{taskText.trim()}” will be created when you start.
        </Text>
      ) : null}
      <Button
        tokens={tokens}
        label={submitLabel}
        variant="primary"
        disabled={!canStart}
        onPress={() =>
          onSubmit({
            projectId,
            taskId: matchingTask?.id,
            newTaskName: matchingTask ? undefined : taskText.trim(),
          })
        }
      />
    </Card>
  );
}
