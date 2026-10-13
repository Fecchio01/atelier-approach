'use client';

import { useActionState, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import Image from 'next/image';

import { saveProfileAction, saveProfilePhotoAction, type ProfileActionState } from '@/app/(app)/configuracoes/actions';

const initialState: ProfileActionState = { status: 'idle', message: '' };
const maxSourcePhotoBytes = 12 * 1024 * 1024;
const maxCompressedPhotoBytes = 240 * 1024;

async function compressProfilePhoto(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
  if (file.size > maxSourcePhotoBytes) throw new Error('A imagem original precisa ter até 12 MB.');

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível abrir essa imagem. Tente outra foto.'));
    });

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.');

    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = '#171d20';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.78));
      if (!blob) throw new Error('Seu navegador não conseguiu preparar a imagem.');
      if (blob.size <= maxCompressedPhotoBytes) {
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Não foi possível ler a imagem.'));
          reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
          reader.readAsDataURL(blob);
        });
      }
      width = Math.max(96, Math.round(width * 0.75));
      height = Math.max(96, Math.round(height * 0.75));
    }

    throw new Error('Essa imagem ficou grande demais. Escolha outra foto.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function ProfileForm({ name: initialName, avatarUrl: initialAvatarUrl, email }: { name: string; avatarUrl: string; email: string }) {
  const [state, formAction, isPending] = useActionState(saveProfileAction, initialState);
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoNotice, setPhotoNotice] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);

  useEffect(() => setName(initialName), [initialName]);
  useEffect(() => {
    setAvatarUrl(initialAvatarUrl);
    setPhotoFailed(false);
  }, [initialAvatarUrl]);

  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR') || 'A';

  async function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPhotoError('');
    setPhotoNotice('');
    setPhotoFailed(false);
    try {
      const nextAvatarUrl = await compressProfilePhoto(file);
      setAvatarUrl(nextAvatarUrl);
      input.value = '';

      setPhotoSaving(true);
      const result = await saveProfilePhotoAction(nextAvatarUrl);
      if (result.status === 'saved') {
        setPhotoNotice(result.message);
      } else {
        setAvatarUrl(initialAvatarUrl);
        setPhotoError(result.message);
      }
    } catch (error) {
      setAvatarUrl(initialAvatarUrl);
      setPhotoError(error instanceof Error ? error.message : 'Não foi possível preparar essa imagem.');
      input.value = '';
    } finally {
      setPhotoSaving(false);
    }
  }

  function cancelPhotoEdit() {
    setPhotoError('');
    setEditingPhoto(false);
  }

  return <section data-atelier-material className="rounded-xl border border-white/10 bg-[var(--atelier-surface)] p-5 md:p-7" aria-labelledby="profile-title">
    <div><h2 id="profile-title" className="text-xl font-semibold tracking-[-0.03em]">Meu perfil</h2><p className="mt-1 text-sm text-white/50">Nome e foto exibidos no sistema.</p></div>
    {state.message && <p role={state.status === 'saved' ? 'status' : 'alert'} className={`mt-5 rounded-lg px-4 py-3 text-sm ${state.status === 'saved' ? 'bg-[var(--atelier-green)]/10 text-[var(--atelier-green)]' : 'bg-red-400/10 text-red-100'}`}>{state.message}</p>}
    <form action={formAction} className="mt-6 grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
      <div className="flex flex-col items-center gap-3 sm:pt-1">
        <div role="img" aria-label={`${name || 'Perfil'}: foto de perfil`} className="relative flex size-20 items-center justify-center overflow-hidden rounded-full border border-[var(--atelier-green)]/35 bg-[var(--atelier-green)] text-2xl font-semibold text-[#172006] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
          {avatarUrl && !photoFailed ? <Image src={avatarUrl} alt="" width={80} height={80} unoptimized onError={() => setPhotoFailed(true)} className="absolute inset-0 size-full object-cover" /> : initials}
        </div>
        <button type="button" aria-label="Editar foto de perfil" aria-expanded={editingPhoto} aria-controls="profile-photo-editor" onClick={() => editingPhoto ? cancelPhotoEdit() : setEditingPhoto(true)} className="min-h-9 rounded-lg border border-white/15 bg-white/[0.035] px-5 text-sm font-medium text-white/80 transition-colors hover:border-[var(--atelier-green)]/50 hover:text-white">
          {editingPhoto ? 'Fechar' : 'Editar'}
        </button>
      </div>
      <div className="grid min-w-0 gap-4">
        <label className="grid gap-2 text-sm font-medium">Nome exibido<input name="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="min-h-11 min-w-0 rounded-lg border border-white/15 bg-[var(--atelier-surface-raised)] px-4 text-base outline-none sm:text-sm focus:border-[var(--atelier-green)]" /></label>
        <input type="hidden" name="avatarUrl" value={avatarUrl} />
        {editingPhoto ? <div id="profile-photo-editor" className="grid gap-2 text-sm font-medium">
          <span>Foto do dispositivo</span>
          <label htmlFor="profile-photo-file" className={`inline-flex min-h-11 w-fit items-center rounded-lg border border-[var(--atelier-green)]/45 bg-[var(--atelier-green)]/10 px-4 font-medium text-[var(--atelier-green)] transition-colors hover:bg-[var(--atelier-green)]/15 ${photoSaving ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>{photoSaving ? 'Salvando foto…' : 'Escolher foto'}</label>
          <input id="profile-photo-file" type="file" accept="image/*" onChange={handlePhotoChange} disabled={photoSaving} className="sr-only" aria-describedby="profile-photo-help" />
          <span id="profile-photo-help" className="text-xs font-normal text-white/45">Escolha uma imagem da galeria ou dos arquivos. A foto será salva automaticamente na sua conta.</span>
          {photoNotice ? <span role="status" className="text-xs font-normal text-[var(--atelier-green)]">{photoNotice}</span> : null}
          {photoError ? <span role="alert" className="text-xs font-normal text-red-200">{photoError}</span> : null}
        </div> : null}
        <div className="rounded-lg border border-white/10 bg-[#1b2328] px-4 py-3"><span className="block text-[11px] uppercase tracking-[0.16em] text-white/40">E-mail de acesso</span><span className="mt-1 block break-all text-sm text-white/75">{email}</span></div>
        <button disabled={isPending} className="min-h-11 w-full min-w-32 rounded-lg bg-[var(--atelier-green)] px-5 font-semibold text-[#101507] transition-[transform,opacity] duration-[var(--atelier-motion-duration)] ease-[var(--atelier-motion-easing)] hover:bg-[var(--atelier-green-hover)] disabled:cursor-wait disabled:opacity-60 sm:w-fit">{isPending ? 'Salvando perfil…' : 'Salvar perfil'}</button>
      </div>
    </form>
  </section>;
}
