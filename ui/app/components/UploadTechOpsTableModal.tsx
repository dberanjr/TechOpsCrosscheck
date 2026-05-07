import React, { useMemo, useRef, useState } from "react";
import { Modal } from "@dynatrace/strato-components/overlays";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextArea } from "@dynatrace/strato-components/forms";
import { SimpleTable } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { parseTechOpsCsv, type TechOpsRow } from "../lib/parseTechOpsCsv";
import { useCrosscheck } from "../context/CrosscheckContext";

export interface UploadTechOpsTableModalProps {
  show: boolean;
  onDismiss: () => void;
}

const PLACEHOLDER = `AppCI,ApplicationName,Tier,Director
ASG,Application Service Gateway,1 - most critical,Jane Doe
TUX,Transaction Unit X,2,John Smith`;

const PREVIEW_COLUMNS = [
  { id: "AppCI", header: "AppCI", accessor: "AppCI" as const },
  { id: "ApplicationName", header: "ApplicationName", accessor: "ApplicationName" as const },
  { id: "Tier", header: "Tier", accessor: "Tier" as const },
  { id: "Director", header: "Director", accessor: "Director" as const },
];

export const UploadTechOpsTableModal = ({
  show,
  onDismiss,
}: UploadTechOpsTableModalProps) => {
  const { saveUploadedTable } = useCrosscheck();
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => parseTechOpsCsv(text), [text]);
  const previewRows: TechOpsRow[] = result.rows.slice(0, 10);
  const canSave = result.rows.length > 0 && result.errors.length === 0;

  const reset = () => {
    setText("");
    setSaveError(null);
  };

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      setText(value);
    };
    reader.readAsText(file);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveUploadedTable(result.rows);
      reset();
      onDismiss();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Save failed.";
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    if (saving) return;
    reset();
    onDismiss();
  };

  return (
    <Modal
      show={show}
      onDismiss={handleDismiss}
      title="Upload TechOps application list"
      size="medium"
      footer={
        <Flex gap={8} justifyContent="flex-end">
          <Button onClick={handleDismiss} variant="default" disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSave()}
            variant="emphasized"
            color="primary"
            disabled={!canSave || saving}
          >
            {saving ? "Saving…" : `Save ${result.rows.length} rows`}
          </Button>
        </Flex>
      }
    >
      <Flex flexDirection="column" gap={16}>
        <Paragraph>
          Paste CSV or TSV with the columns AppCI, ApplicationName, Tier,
          Director. Tier accepts 1-4, T1-T4, "Tier 1", or the canonical strings.
        </Paragraph>

        <Flex gap={8} alignItems="center">
          <Button onClick={() => fileInputRef.current?.click()} variant="default">
            Choose file…
          </Button>
          <Text textStyle="small" style={{ color: Colors.Text.Neutral.Default }}>
            or paste below
          </Text>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain"
            style={{ display: "none" }}
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </Flex>

        <TextArea
          value={text}
          onChange={(value) => setText(value)}
          placeholder={PLACEHOLDER}
          rows={8}
          resize="vertical"
        />

        {result.errors.length > 0 && (
          <Flex flexDirection="column" gap={4}>
            <Heading level={5} style={{ color: Colors.Text.Critical.Default, margin: 0 }}>
              {result.errors.length} error{result.errors.length === 1 ? "" : "s"}
            </Heading>
            {result.errors.map((e, i) => (
              <Text
                key={i}
                textStyle="small"
                style={{ color: Colors.Text.Critical.Default }}
              >
                Line {e.line}: {e.message}
              </Text>
            ))}
          </Flex>
        )}

        {result.warnings.length > 0 && (
          <Flex flexDirection="column" gap={4}>
            <Heading level={5} style={{ margin: 0 }}>
              {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
            </Heading>
            {result.warnings.slice(0, 10).map((w, i) => (
              <Text key={i} textStyle="small">
                Line {w.line}: {w.message}
              </Text>
            ))}
            {result.warnings.length > 10 && (
              <Text textStyle="small">
                …and {result.warnings.length - 10} more.
              </Text>
            )}
          </Flex>
        )}

        {previewRows.length > 0 && (
          <Flex flexDirection="column" gap={4}>
            <Heading level={5} style={{ margin: 0 }}>
              Preview (first {previewRows.length} of {result.rows.length})
            </Heading>
            <SimpleTable data={previewRows} columns={PREVIEW_COLUMNS} />
          </Flex>
        )}

        {saveError && (
          <Text style={{ color: Colors.Text.Critical.Default }}>{saveError}</Text>
        )}
      </Flex>
    </Modal>
  );
};
