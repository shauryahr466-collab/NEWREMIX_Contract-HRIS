import React, { useState, useEffect } from 'react';
import { FileText, UploadCloud, Trash2, ExternalLink, Download, AlertCircle, CheckCircle2, Folder, File, Plus, Loader2 } from 'lucide-react';
import { uploadLocalDocument, fetchLocalEmployeeDocuments, deleteLocalDocument } from '../lib/localClient';
import { toast } from 'sonner';

interface HRDocument {
  id: string;
  employeeId: string;
  documentType: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  uploadedAt: string;
  uploadedBy?: string;
  notes?: string;
}

const DOCUMENT_TYPES = [
  'Appointment Letter',
  'Contract',
  'Citizenship',
  'Training Document',
  'Performance Document',
  'Disciplinary Document',
  'Other HR Document'
];

export function EmployeeDocuments({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const [documents, setDocuments] = useState<HRDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);

  // Form state
  const [documentType, setDocumentType] = useState('Appointment Letter');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await fetchLocalEmployeeDocuments(employeeId);
      setDocuments(data);
    } catch (e) {
      console.warn('Load documents error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [employeeId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!title) {
        setTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }
    if (!title.trim()) {
      toast.error('Please enter a document title');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async () => {
        const fileBase64 = reader.result as string;
        await uploadLocalDocument({
          employeeId,
          documentType,
          title: title.trim(),
          fileName: selectedFile.name,
          fileBase64,
          notes: notes.trim(),
          uploadedBy: 'HR User'
        });

        toast.success('Document uploaded directly to local disk storage!');
        setTitle('');
        setNotes('');
        setSelectedFile(null);
        setShowUploadForm(false);
        await loadDocuments();
      };
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId: string, docTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${docTitle}" from local disk?`)) return;
    try {
      await deleteLocalDocument(docId);
      toast.success('Document deleted');
      await loadDocuments();
    } catch (e) {
      toast.error('Failed to delete document');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Folder size={16} className="text-primary" /> Local Employee Documents
          </h3>
          <p className="text-[11px] text-slate-500">Stored locally under D:\SHRM-HRIS\data\documents\ (Zero cloud storage used)</p>
        </div>
        <button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm"
        >
          <Plus size={14} /> Upload Document
        </button>
      </div>

      {showUploadForm && (
        <form onSubmit={handleUpload} className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                Document Type
              </label>
              <select
                value={documentType}
                onChange={e => setDocumentType(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-200"
              >
                {DOCUMENT_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                Document Title
              </label>
              <input
                type="text"
                placeholder="e.g. Employment Contract 2026"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-200"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
              Select Local File (PDF, Image, Word, Excel)
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
              Notes / Remarks (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Signed on joining date"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-800 dark:text-slate-200"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded hover:bg-emerald-700 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {isUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} Save to Local Disk
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading documents from SQLite...
        </div>
      ) : documents.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-slate-400">
          <FileText size={28} className="mx-auto mb-2 text-slate-300 dark:text-slate-700" />
          <p className="text-xs font-medium">No documents uploaded yet for {employeeName}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Uploaded files are stored safely on your local computer's hard drive.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-900">
          {documents.map(doc => (
            <div key={doc.id} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded shrink-0">
                  <File size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{doc.title}</span>
                    <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 rounded font-medium">
                      {doc.documentType}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {doc.fileName} • {formatFileSize(doc.fileSize)} • Uploaded {new Date(doc.uploadedAt).toLocaleDateString()}
                  </p>
                  {doc.notes && (
                    <p className="text-[10px] text-slate-400 italic mt-0.5">{doc.notes}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`/api/local/documents/download/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                  title="Open / Download Document"
                >
                  <ExternalLink size={14} />
                </a>
                <button
                  onClick={() => handleDelete(doc.id, doc.title)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors"
                  title="Delete Document"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
