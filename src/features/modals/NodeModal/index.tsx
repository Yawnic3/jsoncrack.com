import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Textarea, Group } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import useFile from "../../../store/useFile";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const getJson = useJson(state => state.getJson);
  const setJson = useJson(state => state.setJson);
  const setContents = useFile(state => state.setContents);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editedText, setEditedText] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Whenever modal opens or selected node changes, reset editing state
    setIsEditing(false);
    setError(null);
    setEditedText(normalizeNodeData(nodeData?.text ?? []));
  }, [nodeData, opened]);

  const handleEdit = () => {
    setEditedText(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(true);
    setError(null);
  };

  const parseEdited = (text: string) => {
    try {
      // try parse as JSON first
      return JSON.parse(text);
    } catch (e) {
      // fallback: treat as raw string/primitive (try to coerce numbers/booleans)
      const trimmed = text.trim();
      if (trimmed === "true") return true;
      if (trimmed === "false") return false;
      if (trimmed === "null") return null;
      if (!isNaN(Number(trimmed)) && trimmed !== "") return Number(trimmed);
      // otherwise return as string
      return text;
    }
  };

  const setAtPath = (root: any, path: NodeData["path"] | undefined, value: any) => {
    if (!path || path.length === 0) {
      // replace whole document
      return value;
    }

    const newRoot = Array.isArray(root) ? [...root] : { ...root };
    let cur: any = newRoot;
    for (let i = 0; i < path.length - 1; i++) {
      const seg: any = path[i];
      if (typeof seg === "number") {
        if (!Array.isArray(cur[seg])) cur[seg] = [];
        cur[seg] = Array.isArray(cur[seg]) ? [...cur[seg]] : { ...cur[seg] };
        cur = cur[seg];
      } else {
        if (cur[seg] === undefined || cur[seg] === null) cur[seg] = {};
        cur[seg] = Array.isArray(cur[seg]) ? [...cur[seg]] : { ...cur[seg] };
        cur = cur[seg];
      }
    }

    const last = path[path.length - 1] as any;
    cur[last] = value;
    return newRoot;
  };

  const getAtPath = (root: any, path: NodeData["path"] | undefined) => {
    if (!path || path.length === 0) return root;
    let cur = root;
    for (let i = 0; i < path.length; i++) {
      const seg: any = path[i];
      if (cur === undefined || cur === null) return undefined;
      cur = cur[seg];
    }
    return cur;
  };

  const handleSave = () => {
    setError(null);
    try {
      const rootJsonStr = getJson();
      const rootObj = rootJsonStr ? JSON.parse(rootJsonStr) : {};

      const isObjectNode = (nodeData?.text ?? []).some(r => r.key != null);

      const parsed = parseEdited(editedText);

      // If editing an object node, merge parsed fields into the existing object at path
      let valueToSet = parsed;
      if (isObjectNode && parsed && typeof parsed === "object") {
        const existing = getAtPath(rootObj, nodeData?.path);
        // merge shallowly so we preserve nested fields like `details` and `nutrients`
        valueToSet = { ...(existing && typeof existing === "object" ? existing : {}), ...parsed };
      }

      const newRoot = setAtPath(rootObj, nodeData?.path, valueToSet);

      const newJsonStr = JSON.stringify(newRoot, null, 2);
      setJson(newJsonStr);

      // Update left-side editor contents so the user sees the change immediately.
      // Use skipUpdate: true to avoid triggering another graph parse (we already updated graph via setJson).
      try {
        setContents({ contents: newJsonStr, hasChanges: false, skipUpdate: true });
      } catch (e) {
        // ignore; best-effort to keep editor in sync
      }

      setIsEditing(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleCancel = () => {
    setEditedText(normalizeNodeData(nodeData?.text ?? []));
    setIsEditing(false);
    setError(null);
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group>
              {!isEditing ? (
                <Button size="xs" variant="default" onClick={handleEdit}>
                  Edit
                </Button>
              ) : (
                <>
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" color="gray" variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Textarea
                minRows={6}
                value={editedText}
                onChange={e => setEditedText(e.currentTarget.value)}
                maw={600}
              />
            )}
            {error ? (
              <Text color="red" fz="xs">
                {error}
              </Text>
            ) : null}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
