import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Modal } from "@dynatrace/strato-components/overlays";
import { TextInput, TextArea } from "@dynatrace/strato-components/forms";
import { DataTable } from "@dynatrace/strato-components/tables";
import type { DataTableColumnDef } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { useCrosscheck, type SavedPivot } from "../context/CrosscheckContext";
import { formatDate } from "../lib/formatters";

export interface SavedPivotsPanelProps {
  /** When true, render as a collapsible accordion that starts closed. */
  collapsible?: boolean;
}

interface EditDialogState {
  mode: "create" | "edit";
  pivot?: SavedPivot;
}

export const SavedPivotsPanel = ({ collapsible = false }: SavedPivotsPanelProps) => {
  const {
    savedPivots,
    pivotIso,
    windowDays,
    saveSavedPivot,
    updateSavedPivot,
    deleteSavedPivot,
    loadSavedPivot,
  } = useCrosscheck();
  const [open, setOpen] = useState(!collapsible);
  const [dialog, setDialog] = useState<EditDialogState | null>(null);

  const columns = React.useMemo<DataTableColumnDef<SavedPivot>[]>(
    () => [
      { id: "name", header: "Name", accessor: "name", width: { type: "auto", maxWidth: 240 } },
      { id: "pivotIso", header: "Pivot date", accessor: "pivotIso", width: 140 },
      {
        id: "windowDays",
        header: "Window",
        accessor: "windowDays",
        width: 100,
        cell: ({ rowData }) => (
          <Text textStyle="small">±{rowData.windowDays}d</Text>
        ),
      },
      {
        id: "annotation",
        header: "Annotation",
        accessor: "annotation",
        width: { type: "auto", maxWidth: 320 },
      },
      {
        id: "createdAt",
        header: "Created",
        accessor: "createdAt",
        width: 140,
        cell: ({ rowData }) => (
          <Text textStyle="small">{formatDate(rowData.createdAt)}</Text>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        accessor: "id",
        width: 240,
        cell: ({ rowData }) => (
          <Flex gap={4}>
            <Button onClick={() => loadSavedPivot(rowData.id)} variant="default">
              Load
            </Button>
            <Button
              onClick={() => setDialog({ mode: "edit", pivot: rowData })}
              variant="default"
            >
              Edit
            </Button>
            <Button
              onClick={() => void deleteSavedPivot(rowData.id)}
              variant="default"
              color="critical"
            >
              Delete
            </Button>
          </Flex>
        ),
      },
    ],
    [loadSavedPivot, deleteSavedPivot],
  );

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex alignItems="center" justifyContent="space-between">
        <Heading level={3} style={{ margin: 0 }}>
          Saved pivots ({savedPivots.length})
        </Heading>
        <Flex gap={8}>
          <Button
            onClick={() => setDialog({ mode: "create" })}
            variant="emphasized"
            color="primary"
          >
            Save current pivot
          </Button>
          {collapsible && (
            <Button onClick={() => setOpen((v) => !v)} variant="default">
              {open ? "Collapse" : "Expand"}
            </Button>
          )}
        </Flex>
      </Flex>

      {open && (
        savedPivots.length === 0 ? (
          <Paragraph style={{ color: Colors.Text.Neutral.Default }}>
            No saved pivots yet. Capture the current pivot and window with "Save
            current pivot".
          </Paragraph>
        ) : (
          <DataTable
            data={Array.from(savedPivots)}
            columns={columns}
            sortable
            fullWidth
          />
        )
      )}

      <SavePivotDialog
        state={dialog}
        defaultPivotIso={pivotIso}
        defaultWindowDays={windowDays}
        onDismiss={() => setDialog(null)}
        onCreate={async (input) => {
          await saveSavedPivot(input);
          setDialog(null);
        }}
        onUpdate={async (id, patch) => {
          await updateSavedPivot(id, patch);
          setDialog(null);
        }}
      />
    </Flex>
  );
};

interface SavePivotDialogProps {
  state: EditDialogState | null;
  defaultPivotIso: string;
  defaultWindowDays: number;
  onDismiss: () => void;
  onCreate: (input: {
    name: string;
    pivotIso: string;
    windowDays: number;
    annotation?: string;
  }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<SavedPivot>) => Promise<void>;
}

const SavePivotDialog = ({
  state,
  defaultPivotIso,
  defaultWindowDays,
  onDismiss,
  onCreate,
  onUpdate,
}: SavePivotDialogProps) => {
  const [name, setName] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (state?.mode === "edit" && state.pivot) {
      setName(state.pivot.name);
      setAnnotation(state.pivot.annotation ?? "");
    } else {
      setName("");
      setAnnotation("");
    }
  }, [state]);

  if (!state) return null;

  const isEdit = state.mode === "edit" && Boolean(state.pivot);
  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit && state.pivot) {
        await onUpdate(state.pivot.id, {
          name: name.trim(),
          annotation: annotation.trim() || undefined,
        });
      } else {
        await onCreate({
          name: name.trim(),
          pivotIso: defaultPivotIso,
          windowDays: defaultWindowDays,
          annotation: annotation.trim() || undefined,
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show
      onDismiss={() => {
        if (!saving) onDismiss();
      }}
      title={isEdit ? "Edit saved pivot" : "Save current pivot"}
      size="small"
      footer={
        <Flex gap={8} justifyContent="flex-end">
          <Button onClick={onDismiss} variant="default" disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            variant="emphasized"
            color="primary"
            disabled={!canSave}
          >
            {saving ? "Saving…" : isEdit ? "Save" : "Save pivot"}
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={12}>
        <Flex flexDirection="column" gap={4}>
          <Text textStyle="small-emphasized">Name</Text>
          <TextInput value={name} onChange={(v) => setName(v)} placeholder="e.g., post-MRD migration" />
        </Flex>
        <Flex flexDirection="column" gap={4}>
          <Text textStyle="small-emphasized">Annotation (optional)</Text>
          <TextArea
            value={annotation}
            onChange={(v) => setAnnotation(v)}
            rows={3}
            placeholder="What change does this pivot mark?"
          />
        </Flex>
        {!isEdit && (
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
            Capturing pivot {defaultPivotIso} · ±{defaultWindowDays}d window.
          </Text>
        )}
      </Flex>
    </Modal>
  );
};
