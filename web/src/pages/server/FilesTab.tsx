import { useCallback, useEffect, useRef, useState } from 'react';
import { useServerDetail } from './ServerContext.js';
import { api, ApiError, downloadUrl } from '../../api/client.js';
import type { FileEntry } from '../../api/types.js';
import { Button, Card, ErrorText, Input } from '../../components/ui.js';
import { useConfirm } from '../../components/ConfirmDialog.js';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

const EDITABLE_EXT = /\.(txt|properties|json|yml|yaml|conf|cfg|toml|log|md|sh|bat|xml|mcmeta)$/i;

export function FilesTab() {
  const { serverId, canWrite } = useServerDetail();
  const confirm = useConfirm();
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[] | null>(null);
  const [error, setError] = useState('');
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (target: string) => {
      try {
        const res = await api.get<{ entries: FileEntry[] }>(`/servers/${serverId}/files/list?path=${encodeURIComponent(target)}`);
        setEntries(res.entries);
        setError('');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to list files');
      }
    },
    [serverId]
  );

  useEffect(() => {
    load(path);
  }, [path, load]);

  async function openFile(entry: FileEntry) {
    if (!EDITABLE_EXT.test(entry.name) && entry.size > 512 * 1024) {
      window.open(downloadUrl(`/servers/${serverId}/files/download?path=${encodeURIComponent(entry.path)}`), '_blank');
      return;
    }
    try {
      const res = await api.get<{ content: string }>(`/servers/${serverId}/files/content?path=${encodeURIComponent(entry.path)}`);
      setEditingPath(entry.path);
      setEditorContent(res.content);
      setEditorDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to open file');
    }
  }

  async function saveFile() {
    if (!editingPath) return;
    setEditorSaving(true);
    try {
      await api.put(`/servers/${serverId}/files/content`, { path: editingPath, content: editorContent });
      setEditorDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save file');
    } finally {
      setEditorSaving(false);
    }
  }

  async function createFolder() {
    const name = window.prompt('New folder name');
    if (!name) return;
    try {
      await api.post(`/servers/${serverId}/files/mkdir`, { path: path ? `${path}/${name}` : name });
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create folder');
    }
  }

  async function deleteEntry(entry: FileEntry) {
    const ok = await confirm({
      title: entry.isDirectory ? 'Delete folder' : 'Delete file',
      message: `Delete ${entry.name}? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/servers/${serverId}/files?path=${encodeURIComponent(entry.path)}`);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  }

  async function renameEntry(entry: FileEntry) {
    const name = window.prompt('Rename to', entry.name);
    if (!name || name === entry.name) return;
    const to = path ? `${path}/${name}` : name;
    try {
      await api.post(`/servers/${serverId}/files/rename`, { from: entry.path, to });
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to rename');
    }
  }

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.append('path', path);
    Array.from(files).forEach((f) => formData.append('files', f));
    try {
      await api.upload(`/servers/${serverId}/files/upload`, formData);
      await load(path);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (editingPath) {
    return (
      <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={async () => {
              if (editorDirty) {
                const ok = await confirm({
                  title: 'Discard changes',
                  message: 'Discard unsaved changes to this file?',
                  confirmLabel: 'Discard',
                  tone: 'danger',
                });
                if (!ok) return;
              }
              setEditingPath(null);
            }}
          >
            ← Back
          </Button>
          <span className="font-mono text-sm text-slate-300">{editingPath}</span>
          {canWrite && (
            <Button variant="primary" className="ml-auto" onClick={saveFile} disabled={!editorDirty || editorSaving}>
              {editorSaving ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
        <textarea
          className="console-view flex-1 resize-none rounded-lg border border-surface-700 bg-surface-900 p-4 text-[13px] text-slate-200 focus:outline-none focus:ring-2 focus:ring-accent-600/60"
          value={editorContent}
          spellCheck={false}
          readOnly={!canWrite}
          onChange={(e) => {
            setEditorContent(e.target.value);
            setEditorDirty(true);
          }}
        />
      </div>
    );
  }

  const segments = path ? path.split('/') : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="text-sm text-accent-500 hover:underline" onClick={() => setPath('')}>
          server
        </button>
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-2 text-sm text-slate-400">
            /
            <button className="hover:underline hover:text-accent-500" onClick={() => setPath(segments.slice(0, i + 1).join('/'))}>
              {seg}
            </button>
          </span>
        ))}
        {canWrite && (
          <div className="ml-auto flex gap-2">
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => onUpload(e.target.files)} />
            <Button onClick={() => fileInputRef.current?.click()}>Upload</Button>
            <Button onClick={createFolder}>New folder</Button>
          </div>
        )}
      </div>

      <ErrorText>{error}</ErrorText>

      <Card className="divide-y divide-surface-800">
        {entries === null ? (
          <p className="px-4 py-3 text-sm text-slate-500">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">This folder is empty.</p>
        ) : (
          entries.map((entry, i) => (
            <div
              key={entry.path}
              style={{ animationDelay: `${Math.min(i, 20) * 18}ms` }}
              className="animate-fade-in-up flex items-center gap-3 px-4 py-2 transition-colors hover:bg-surface-800/50"
            >
              <button
                className="flex flex-1 items-center gap-2 truncate text-left text-sm"
                onClick={() => (entry.isDirectory ? setPath(entry.path) : openFile(entry))}
              >
                <span>{entry.isDirectory ? '📁' : '📄'}</span>
                <span className="truncate text-slate-200">{entry.name}</span>
              </button>
              <span className="w-20 shrink-0 text-right text-xs text-slate-500">
                {entry.isDirectory ? '' : formatSize(entry.size)}
              </span>
              <span className="w-36 shrink-0 text-right text-xs text-slate-500">
                {new Date(entry.modifiedAt).toLocaleString()}
              </span>
              <div className="flex shrink-0 gap-1">
                {!entry.isDirectory && (
                  <a
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-surface-700 hover:text-slate-200"
                    href={downloadUrl(`/servers/${serverId}/files/download?path=${encodeURIComponent(entry.path)}`)}
                  >
                    Download
                  </a>
                )}
                {canWrite && (
                  <>
                    <button
                      className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-surface-700 hover:text-slate-200"
                      onClick={() => renameEntry(entry)}
                    >
                      Rename
                    </button>
                    <button
                      className="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                      onClick={() => deleteEntry(entry)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
