import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, ApiError } from '../api/client.js';
import { useToast } from './Toast.js';
import { Button, Card, ErrorText, Field, Input, Modal, Spinner } from './ui.js';

const CONFIRM_PHRASE = 'DELETE EVERYTHING';

export function FactoryResetCard() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [restarting, setRestarting] = useState(false);

  function close() {
    setOpen(false);
    setStep(0);
    setTyped('');
    setPassword('');
    setError('');
  }

  async function submit() {
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post<{ message: string }>('/environment/reset', {
        confirmText: typed,
        password,
      });
      toast.success(res.message);
      setRestarting(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        toast.show('Lost the connection — if the reset actually started, MultiCraft is restarting now. Wait a few seconds and reload.');
        setRestarting(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (restarting) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Spinner className="h-5 w-5 text-accent-400" />
          <div>
            <p className="text-sm font-semibold text-slate-100">MultiCraft is restarting…</p>
            <p className="text-xs text-slate-400">
              This page will stop responding for a few seconds. Reload once it's back — you'll land on the first-run
              setup wizard.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-red-500/25 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-red-400">Danger zone</h2>
        <p className="mt-1 mb-4 text-xs text-slate-500">
          Permanently delete every account, every server (including its world files), and every backup, and return
          this install to the first-run setup wizard. This cannot be undone from the UI.
        </p>
        <Button variant="danger" onClick={() => setOpen(true)}>
          Delete everything &amp; start fresh
        </Button>
      </Card>

      <Modal open={open} onClose={close} title="Delete everything and start fresh">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="warn" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                <p className="mb-2 font-semibold">This permanently deletes:</p>
                <ul className="list-inside list-disc space-y-1">
                  <li>Every user account (including yours)</li>
                  <li>Every server this panel manages — jars, plugins, and worlds included</li>
                  <li>Every backup of every server</li>
                </ul>
                <p className="mt-2">The panel restarts and shows the first-run setup wizard, as if freshly installed.</p>
              </div>
              <p className="text-xs text-slate-500">
                Your current data isn't deleted immediately — it's kept on disk as a timestamped backup folder,
                but MultiCraft itself won't offer any way to restore it. Recovering it means stopping the panel and
                renaming the folder back by hand.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={() => setStep(1)}>
                  I understand, continue
                </Button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="phrase" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <p className="text-sm text-slate-300">
                Type <span className="font-mono font-semibold text-red-400">{CONFIRM_PHRASE}</span> to confirm.
              </p>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus placeholder={CONFIRM_PHRASE} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button variant="danger" disabled={typed !== CONFIRM_PHRASE} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="password" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-4">
              <Field label="Confirm your password">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && password && submit()}
                />
              </Field>
              <ErrorText>{error}</ErrorText>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={close} disabled={submitting}>
                  Cancel
                </Button>
                <Button variant="danger" disabled={!password || submitting} onClick={submit}>
                  {submitting ? 'Deleting everything…' : 'Delete everything now'}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Modal>
    </>
  );
}
