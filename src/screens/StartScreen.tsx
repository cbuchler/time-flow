import React, { useState } from "react";
import { ScrollView } from "react-native";
import { EmptyState, Field } from "../components/Primitives";
import { ProjectTaskForm } from "../components/ProjectTaskForm";
import { Tokens } from "../lib/tokens";
import { AppStateView } from "../types/app";

export function StartScreen({
  state,
  tokens,
  mode,
  onCreateProject,
  onStart,
}: {
  state: AppStateView;
  tokens: Tokens;
  mode: "track" | "focus";
  onCreateProject: (name: string) => void;
  onStart: (value: { projectId: string; taskId?: string; newTaskName?: string }) => void;
}) {
  const [projectName, setProjectName] = useState("");
  const hasProject = state.projects.some((project) => !project.archived_at);
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      {!hasProject ? (
        <>
          <EmptyState
            tokens={tokens}
            title="Create a project first"
            body="Every work entry needs a project and reusable task. Start with the project you want to track today."
          />
          <Field
            tokens={tokens}
            label="Project name"
            value={projectName}
            onChangeText={setProjectName}
            placeholder="Acme Website"
          />
          <EmptyState
            tokens={tokens}
            title="Next step"
            body="After creating the project, type the first task inline and start your timer."
            action={{
              label: "Create project",
              onPress: () => projectName.trim() && onCreateProject(projectName.trim()),
            }}
          />
        </>
      ) : (
        <ProjectTaskForm
          tokens={tokens}
          projects={state.projects}
          tasks={state.tasks}
          submitLabel={mode === "focus" ? "Start focus" : "Start tracking"}
          onSubmit={onStart}
        />
      )}
    </ScrollView>
  );
}
