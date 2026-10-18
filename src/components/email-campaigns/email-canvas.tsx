'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowUp, Copy, Trash2 } from 'lucide-react';
import { renderEmailBlock } from '@/lib/email-campaigns/render';
import type {
  EmailBlock,
  EmailBlockType,
  EmailDesignSettings,
} from '@/lib/email-campaigns/types';
import { defaultEmailBlockFontSize } from '@/lib/email-campaigns/types';

const INLINE_EDITABLE: EmailBlockType[] = ['hero', 'heading', 'text', 'footer'];

export interface EmailCanvasLabels {
  blockTypes: Record<EmailBlockType, string>;
  placeholders: Record<
    'hero' | 'heading' | 'text' | 'button' | 'footer' | 'image',
    string
  >;
  moveUp: string;
  moveDown: string;
  duplicate: string;
  remove: string;
}

interface EmailCanvasProps {
  blocks: EmailBlock[];
  design: EmailDesignSettings;
  selectedId: string | null;
  mobile: boolean;
  labels: EmailCanvasLabels;
  onSelect: (id: string | null) => void;
  onTextCommit: (id: string, text: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
}

function textStyle(
  block: EmailBlock,
  design: EmailDesignSettings
): CSSProperties {
  const base: CSSProperties = {
    fontFamily: `${design.fontFamily}, sans-serif`,
    textAlign: block.alignment,
    fontSize: block.fontSize ?? defaultEmailBlockFontSize(block.type),
  };
  switch (block.type) {
    case 'hero':
      return {
        ...base,
        color: '#ffffff',
        fontWeight: 'bold',
        lineHeight: 1.2,
      };
    case 'heading':
      return {
        ...base,
        color: design.primaryText,
        fontWeight: 'bold',
        lineHeight: 1.25,
      };
    case 'footer':
      return {
        ...base,
        color: design.secondaryText,
        lineHeight: 1.6,
      };
    default:
      return {
        ...base,
        color: design.secondaryText,
        lineHeight: 1.6,
      };
  }
}

function containerStyle(
  block: EmailBlock,
  design: EmailDesignSettings
): CSSProperties {
  switch (block.type) {
    case 'hero':
      return {
        margin: '0 0 20px',
        padding: '40px 24px',
        borderRadius: design.cornerRadius,
        background: design.accentColor,
      };
    case 'footer':
      return {
        marginTop: 24,
        paddingTop: 16,
        borderTop: '1px solid #e4e7ec',
      };
    default:
      return { margin: '0 0 20px' };
  }
}

function InlineTextEditor({
  block,
  design,
  placeholder,
  onCommit,
  onClose,
}: {
  block: EmailBlock;
  design: EmailDesignSettings;
  placeholder: string;
  onCommit: (text: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(block.text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  return (
    <div style={containerStyle(block, design)}>
      <textarea
        ref={ref}
        value={draft}
        rows={1}
        maxLength={10_000}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onBlur={() => {
          if (!cancelled.current && draft !== block.text) onCommit(draft);
          onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancelled.current = true;
            onClose();
          }
        }}
        style={{
          ...textStyle(block, design),
          display: 'block',
          width: '100%',
          margin: 0,
          padding: 0,
          border: 0,
          outline: '2px dashed rgba(37, 99, 235, 0.6)',
          outlineOffset: 4,
          background: 'transparent',
          resize: 'none',
          overflow: 'hidden',
        }}
      />
    </div>
  );
}

function ImagePlaceholder({ label }: { label: string }) {
  return (
    <div className="mb-5 flex h-36 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
      {label}
    </div>
  );
}

export function EmailCanvas({
  blocks,
  design,
  selectedId,
  mobile,
  labels,
  onSelect,
  onTextCommit,
  onMove,
  onDuplicate,
  onRemove,
}: EmailCanvasProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div
      className="min-h-full px-3 py-6 sm:px-8"
      onClick={() => {
        setEditingId(null);
        onSelect(null);
      }}
    >
      <div
        className={`mx-auto transition-[width] ${
          mobile ? 'w-[375px]' : 'w-full max-w-[640px]'
        }`}
        style={{ fontFamily: `${design.fontFamily}, sans-serif` }}
      >
        <div
          className="shadow-sm"
          style={{
            background: design.sectionBackground,
            borderRadius: design.cornerRadius,
            padding: design.sectionSpacing,
          }}
        >
          {blocks.map((block, index) => {
            const selected = block.id === selectedId;
            const editing = block.id === editingId;
            const editable = INLINE_EDITABLE.includes(block.type);
            const placeholder =
              block.type in labels.placeholders
                ? labels.placeholders[
                    block.type as keyof EmailCanvasLabels['placeholders']
                  ]
                : '';
            const showPlaceholder =
              !block.text.trim() && block.type in labels.placeholders;
            const html = renderEmailBlock(
              showPlaceholder ? { ...block, text: placeholder } : block,
              design
            );

            return (
              <div key={block.id} className="relative">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={labels.blockTypes[block.type]}
                  aria-pressed={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (editingId && editingId !== block.id) setEditingId(null);
                    onSelect(block.id);
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (editable) setEditingId(block.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(block.id);
                    }
                  }}
                  className={`relative flow-root cursor-pointer rounded-sm outline-offset-2 transition-[outline-color] focus-visible:outline-2 focus-visible:outline-blue-500 ${
                    selected
                      ? 'outline outline-2 outline-blue-500'
                      : 'hover:outline hover:outline-1 hover:outline-blue-300'
                  }`}
                >
                  {editing ? (
                    <InlineTextEditor
                      block={block}
                      design={design}
                      placeholder={placeholder}
                      onCommit={(text) => onTextCommit(block.id, text)}
                      onClose={() => setEditingId(null)}
                    />
                  ) : block.type === 'image' && !html ? (
                    <ImagePlaceholder label={labels.placeholders.image} />
                  ) : (
                    <div
                      className={`pointer-events-none ${
                        showPlaceholder ? 'opacity-50' : ''
                      }`}
                      dangerouslySetInnerHTML={{ __html: html }}
                    />
                  )}
                </div>
                {selected && !editing && (
                  <div
                    className="absolute top-1 right-1 z-10 flex gap-1 rounded-md border border-slate-200 bg-white/95 p-1 shadow-md"
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      aria-label={labels.moveUp}
                      title={labels.moveUp}
                      disabled={index === 0}
                      onClick={() => onMove(block.id, -1)}
                      className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={labels.moveDown}
                      title={labels.moveDown}
                      disabled={index === blocks.length - 1}
                      onClick={() => onMove(block.id, 1)}
                      className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={labels.duplicate}
                      title={labels.duplicate}
                      onClick={() => onDuplicate(block.id)}
                      className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                    >
                      <Copy className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={labels.remove}
                      title={labels.remove}
                      onClick={() => onRemove(block.id)}
                      className="rounded p-1.5 text-slate-600 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
