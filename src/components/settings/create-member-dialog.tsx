'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import type { AccountRole } from '@/lib/auth/roles';

interface CreateMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const ROLES: Exclude<AccountRole, 'owner'>[] = ['admin', 'agent', 'viewer'];

export function CreateMemberDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateMemberDialogProps) {
  const t = useTranslations('Settings.createMember');
  const tRoles = useTranslations('Settings.roles');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Exclude<AccountRole, 'owner'>>('agent');
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setName('');
    setEmail('');
    setPassword('');
    setRole('agent');
    setSubmitting(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12) {
      toast.error(t('temporaryPasswordHint'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/account/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: name,
          role,
        }),
      });
      if (!response.ok) {
        toast.error(t('failed'));
        return;
      }

      toast.success(t('created'));
      reset();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error(t('failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-border bg-popover text-popover-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-member-name">{t('nameLabel')}</Label>
            <Input
              id="new-member-name"
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-member-email">{t('emailLabel')}</Label>
            <Input
              id="new-member-email"
              type="email"
              autoComplete="off"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-member-password">{t('temporaryPasswordLabel')}</Label>
            <Input
              id="new-member-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('temporaryPasswordHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-member-role">{t('roleLabel')}</Label>
            <Select value={role} onValueChange={(value) => value && setRole(value as typeof role)}>
              <SelectTrigger id="new-member-role" className="w-full">
                <SelectValue>{tRoles(role)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {tRoles(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="border-border bg-popover">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('creating') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
