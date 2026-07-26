import React, { useState, useEffect } from 'react';
import { User, TeamResource } from '../types';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { createAuditLog } from '../lib/audit';
import { 
  FileText, 
  Upload, 
  Download, 
  Search, 
  Filter, 
  Tag, 
  Plus, 
  Edit3, 
  Trash2, 
  Eye, 
  Clock, 
  User as UserIcon, 
  X, 
  File, 
  FileSpreadsheet, 
  FolderOpen, 
  Sparkles, 
  CheckCircle2, 
  Grid, 
  List as ListIcon,
  Layers,
  Info,
  Calendar,
  Building2,
  HardDrive
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '../lib/utils';

interface ResourcesManagerProps {
  currentUser: User;
}

const CATEGORIES = [
  'All Categories',
  'NABH Guidelines',
  'Studies & Research',
  'SOPs & Manuals',
  'Templates & Checklists',
  'Reports & Presentations',
  'Other'
];

export function ResourcesManager({ currentUser }: ResourcesManagerProps) {
  const [resources, setResources] = useState<TeamResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  
  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<TeamResource | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Studies & Research',
    version: 'v1.0',
    tags: '',
    fileData: '',
    fileName: '',
    fileType: '',
    fileSize: ''
  });
  
  const [fileUploading, setFileUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Realtime subscription to 'resources' collection
  useEffect(() => {
    const q = query(collection(db, 'resources'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: TeamResource[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as TeamResource));
      setResources(docs);
      setLoading(false);
    }, (error) => {
      console.error('Error loading resources:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Format File Size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle File Input Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileUploading(true);
    const sizeStr = formatBytes(file.size);
    const fileName = file.name;
    const fileType = file.name.split('.').pop()?.toUpperCase() || 'FILE';

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFormData(prev => ({
        ...prev,
        fileName,
        fileType,
        fileSize: sizeStr,
        fileData: result
      }));
      setFileUploading(false);
    };
    reader.onerror = () => {
      alert('Failed to read file.');
      setFileUploading(false);
    };
    reader.readAsDataURL(file);
  };

  // Create Resource Submit
  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Please enter a title for the resource.');
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const newResourceData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        version: formData.version.trim() || 'v1.0',
        fileName: formData.fileName || 'document.pdf',
        fileType: formData.fileType || 'PDF',
        fileSize: formData.fileSize || '150 KB',
        fileData: formData.fileData || '',
        createdBy: currentUser.uid,
        createdByName: currentUser.name,
        createdByRole: currentUser.role,
        createdAt: now,
        updatedAt: now,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.name,
        tags: tagsArray,
        downloadCount: 0
      };

      const docRef = await addDoc(collection(db, 'resources'), newResourceData);

      await createAuditLog({
        itemId: docRef.id,
        itemName: formData.title,
        collectionName: 'resources',
        action: 'create',
        currentUser,
        newData: newResourceData
      });

      setIsUploadModalOpen(false);
      resetForm();
    } catch (err) {
      console.error('Error creating resource:', err);
      alert('Failed to save resource.');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit/Update Resource Submit
  const handleUpdateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource || !formData.title.trim()) return;

    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const tagsArray = formData.tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const updatedFields: any = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        category: formData.category,
        version: formData.version.trim(),
        tags: tagsArray,
        updatedAt: now,
        updatedBy: currentUser.uid,
        updatedByName: currentUser.name
      };

      if (formData.fileData) {
        updatedFields.fileData = formData.fileData;
        updatedFields.fileName = formData.fileName;
        updatedFields.fileType = formData.fileType;
        updatedFields.fileSize = formData.fileSize;
      }

      await updateDoc(doc(db, 'resources', selectedResource.id), updatedFields);

      await createAuditLog({
        itemId: selectedResource.id,
        itemName: formData.title,
        collectionName: 'resources',
        action: 'update',
        currentUser,
        oldData: selectedResource,
        newData: { ...selectedResource, ...updatedFields }
      });

      setIsEditModalOpen(false);
      setSelectedResource(null);
      resetForm();
    } catch (err) {
      console.error('Error updating resource:', err);
      alert('Failed to update resource.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Resource
  const handleDeleteResource = async (resource: TeamResource) => {
    if (currentUser.role !== 'admin' && resource.createdBy !== currentUser.uid) {
      alert('Only administrators or the author can delete this resource.');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${resource.title}"?`)) return;

    try {
      await deleteDoc(doc(db, 'resources', resource.id));
      await createAuditLog({
        itemId: resource.id,
        itemName: resource.title,
        collectionName: 'resources',
        action: 'delete',
        currentUser,
        oldData: resource
      });
    } catch (err) {
      console.error('Error deleting resource:', err);
      alert('Failed to delete resource.');
    }
  };

  // Download Trigger
  const handleDownload = async (resource: TeamResource) => {
    try {
      // Increment download counter
      await updateDoc(doc(db, 'resources', resource.id), {
        downloadCount: (resource.downloadCount || 0) + 1
      });

      if (resource.fileData && resource.fileData.startsWith('data:')) {
        const link = document.createElement('a');
        link.href = resource.fileData;
        link.download = resource.fileName || `${resource.title.replace(/[^a-z0-9]/gi, '_')}.${resource.fileType.toLowerCase()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        // Fallback dummy text blob download
        const blob = new Blob([
          `DOCUMENT TITLE: ${resource.title}\n` +
          `VERSION: ${resource.version}\n` +
          `CATEGORY: ${resource.category}\n` +
          `CREATED BY: ${resource.createdByName}\n` +
          `LAST UPDATE: ${resource.updatedAt}\n\n` +
          `SUMMARY / DESCRIPTION:\n${resource.description}\n\n` +
          `NABH Retention Tracking System - Internal Team Knowledge Resources`
        ], { type: 'text/plain;charset=utf-8' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${resource.title.replace(/[^a-z0-9]/gi, '_')}_${resource.version}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const openEditModal = (resource: TeamResource) => {
    setSelectedResource(resource);
    setFormData({
      title: resource.title,
      description: resource.description || '',
      category: resource.category,
      version: resource.version || 'v1.0',
      tags: resource.tags ? resource.tags.join(', ') : '',
      fileData: resource.fileData || '',
      fileName: resource.fileName || '',
      fileType: resource.fileType || '',
      fileSize: resource.fileSize || ''
    });
    setIsEditModalOpen(true);
  };

  const openPreviewModal = (resource: TeamResource) => {
    setSelectedResource(resource);
    setIsPreviewModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      category: 'Studies & Research',
      version: 'v1.0',
      tags: '',
      fileData: '',
      fileName: '',
      fileType: '',
      fileSize: ''
    });
  };

  // Filtered resources
  const filteredResources = resources.filter(res => {
    const matchesCategory = selectedCategory === 'All Categories' || res.category === selectedCategory;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery = !q || 
      res.title.toLowerCase().includes(q) ||
      (res.description && res.description.toLowerCase().includes(q)) ||
      (res.createdByName && res.createdByName.toLowerCase().includes(q)) ||
      (res.version && res.version.toLowerCase().includes(q)) ||
      (res.tags && res.tags.some(t => t.toLowerCase().includes(q)));
    return matchesCategory && matchesQuery;
  });

  // Icon Helper by File Type
  const getFileIcon = (fileType?: string) => {
    const ft = (fileType || '').toUpperCase();
    if (ft.includes('XLS') || ft.includes('CSV')) return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    if (ft.includes('PDF')) return <FileText className="w-5 h-5 text-red-600" />;
    if (ft.includes('DOC')) return <FileText className="w-5 h-5 text-blue-600" />;
    return <File className="w-5 h-5 text-stone-600" />;
  };

  // Category Color Badges
  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'NABH Guidelines':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Studies & Research':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'SOPs & Manuals':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'Templates & Checklists':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Reports & Presentations':
        return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default:
        return 'bg-stone-100 text-stone-800 border-stone-200';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-white p-6 lg:p-8 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-stone-900 text-white rounded-2xl shadow-md">
              <FolderOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-stone-900">Knowledge & Resources Library</h1>
              <p className="text-xs text-stone-500 uppercase tracking-widest font-semibold mt-0.5">
                Centralized Team Studies, Guidelines & Document Repository
              </p>
            </div>
          </div>
          <p className="text-sm text-stone-600 max-w-2xl mt-2 leading-relaxed">
            Access, upload, and update standard operating procedures, research studies, NABH compliance guidelines, and team checklists. All team members can view, download, and version documents.
          </p>
        </div>

        <button
          onClick={() => { resetForm(); setIsUploadModalOpen(true); }}
          className="flex items-center gap-2 bg-stone-900 text-white px-5 py-3 rounded-2xl font-medium text-sm hover:bg-stone-800 transition-all shadow-md shadow-stone-200 whitespace-nowrap self-start md:self-auto"
        >
          <Upload className="w-4 h-4" />
          Upload New Resource
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Total Documents</p>
            <p className="text-2xl font-serif font-bold text-stone-900">{resources.length}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Categories</p>
            <p className="text-2xl font-serif font-bold text-stone-900">
              {new Set(resources.map(r => r.category)).size}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Latest Version</p>
            <p className="text-sm font-bold text-stone-800 truncate max-w-[150px]">
              {resources.length > 0 ? (resources[0].version || 'v1.0') : 'N/A'}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Download className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">Total Downloads</p>
            <p className="text-2xl font-serif font-bold text-stone-900">
              {resources.reduce((acc, r) => acc + (r.downloadCount || 0), 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto flex-1">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search documents, studies, version, or author..."
              className="w-full pl-9 pr-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Filter */}
          <div className="relative">
            <select
              className="pl-9 pr-8 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-900 cursor-pointer appearance-none"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200 self-end md:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={cn(
              "p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
              viewMode === 'grid' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"
            )}
          >
            <Grid className="w-4 h-4" />
            Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={cn(
              "p-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all",
              viewMode === 'table' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-900"
            )}
          >
            <ListIcon className="w-4 h-4" />
            Table
          </button>
        </div>
      </div>

      {/* Main Content List / Grid */}
      {loading ? (
        <div className="bg-white p-12 rounded-3xl border border-stone-200 text-center text-stone-400">
          <Sparkles className="w-8 h-8 animate-spin mx-auto mb-3 text-stone-300" />
          <p className="text-sm font-medium">Loading knowledge base resources...</p>
        </div>
      ) : filteredResources.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-stone-200 text-center">
          <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4 text-stone-400">
            <FolderOpen className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-1">No Resources Found</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto mb-6">
            {searchQuery || selectedCategory !== 'All Categories'
              ? 'No documents match your filter criteria. Try resetting search or category filter.'
              : 'There are no uploaded resources yet. Click below to add the team\'s first study or document.'}
          </p>
          <button
            onClick={() => { resetForm(); setIsUploadModalOpen(true); }}
            className="inline-flex items-center gap-2 bg-stone-900 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-800 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add First Resource
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredResources.map((res) => (
            <div 
              key={res.id} 
              className="bg-white rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between group relative overflow-hidden"
            >
              {/* Top Row: Category & Version */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border",
                    getCategoryBadgeClass(res.category)
                  )}>
                    {res.category}
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold bg-stone-900 text-white px-2.5 py-0.5 rounded-md shadow-sm">
                      {res.version || 'v1.0'}
                    </span>
                  </div>
                </div>

                {/* Title & File Icon */}
                <div className="flex items-start gap-3 mb-2">
                  <div className="p-2 bg-stone-50 rounded-xl border border-stone-100 shrink-0 mt-0.5">
                    {getFileIcon(res.fileType)}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-stone-900 leading-snug group-hover:text-indigo-600 transition-colors line-clamp-2">
                      {res.title}
                    </h3>
                    <p className="text-[11px] font-mono text-stone-400 mt-0.5">
                      {res.fileName} {res.fileSize ? `• ${res.fileSize}` : ''}
                    </p>
                  </div>
                </div>

                {/* Description */}
                {res.description && (
                  <p className="text-xs text-stone-600 leading-relaxed mb-4 line-clamp-3 bg-stone-50/60 p-3 rounded-xl border border-stone-100">
                    {res.description}
                  </p>
                )}

                {/* Tags */}
                {res.tags && res.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {res.tags.map((tag, idx) => (
                      <span key={idx} className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md flex items-center gap-1 font-medium">
                        <Tag className="w-2.5 h-2.5 text-stone-400" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Metadata & Actions */}
              <div className="pt-4 border-t border-stone-100 space-y-3">
                <div className="flex items-center justify-between text-xs text-stone-500">
                  <div className="flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-stone-400" />
                    <span className="font-medium text-stone-700 truncate max-w-[130px]">{res.createdByName}</span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-stone-400" />
                    <span>{res.updatedAt ? format(parseISO(res.updatedAt), 'MMM d, yyyy') : 'Recently'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => openPreviewModal(res)}
                    className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Details
                  </button>

                  <button
                    onClick={() => handleDownload(res)}
                    className="flex-1 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download
                  </button>

                  <button
                    onClick={() => openEditModal(res)}
                    title="Update Version / Edit"
                    className="p-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-xl transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  {(currentUser.role === 'admin' || currentUser.uid === res.createdBy) && (
                    <button
                      onClick={() => handleDeleteResource(res)}
                      title="Delete Resource"
                      className="p-2 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4 pl-6">Document Title</th>
                  <th className="p-4">Category</th>
                  <th className="p-4">Version</th>
                  <th className="p-4">Created By</th>
                  <th className="p-4">Last Update</th>
                  <th className="p-4">File Info</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredResources.map((res) => (
                  <tr key={res.id} className="hover:bg-stone-50/80 transition-colors">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-stone-100 rounded-xl shrink-0">
                          {getFileIcon(res.fileType)}
                        </div>
                        <div>
                          <p className="font-bold text-stone-900">{res.title}</p>
                          {res.description && (
                            <p className="text-xs text-stone-500 line-clamp-1 max-w-xs">{res.description}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-4">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border inline-block",
                        getCategoryBadgeClass(res.category)
                      )}>
                        {res.category}
                      </span>
                    </td>

                    <td className="p-4 font-mono font-bold text-stone-900 text-xs">
                      <span className="bg-stone-100 border border-stone-200 px-2 py-0.5 rounded-md">
                        {res.version || 'v1.0'}
                      </span>
                    </td>

                    <td className="p-4">
                      <div className="text-xs font-semibold text-stone-800">{res.createdByName}</div>
                      <div className="text-[10px] text-stone-400 capitalize">{res.createdByRole || 'Team Member'}</div>
                    </td>

                    <td className="p-4 text-xs text-stone-600 whitespace-nowrap">
                      {res.updatedAt ? format(parseISO(res.updatedAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                      {res.updatedByName && (
                        <div className="text-[10px] text-stone-400">by {res.updatedByName}</div>
                      )}
                    </td>

                    <td className="p-4 text-xs font-mono text-stone-500 whitespace-nowrap">
                      {res.fileName}
                      {res.fileSize && <span className="block text-[10px] text-stone-400">{res.fileSize}</span>}
                    </td>

                    <td className="p-4 pr-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openPreviewModal(res)}
                          className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDownload(res)}
                          className="p-2 text-stone-900 hover:bg-stone-100 rounded-lg transition-colors font-medium flex items-center gap-1 text-xs"
                          title="Download Document"
                        >
                          <Download className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => openEditModal(res)}
                          className="p-2 text-stone-500 hover:text-indigo-600 hover:bg-stone-100 rounded-lg transition-colors"
                          title="Update / Edit Version"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {(currentUser.role === 'admin' || currentUser.uid === res.createdBy) && (
                          <button
                            onClick={() => handleDeleteResource(res)}
                            className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 lg:p-8 shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-stone-900 text-white rounded-2xl">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-serif font-bold text-stone-900">Upload New Resource</h2>
                  <p className="text-xs text-stone-400">Add a study paper, SOP manual, or NABH document for the team.</p>
                </div>
              </div>
              <button 
                onClick={() => setIsUploadModalOpen(false)}
                className="p-2 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateResource} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Document Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NABH 5th Edition Clinical Audit Guidelines"
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 cursor-pointer"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.filter(c => c !== 'All Categories').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                    Version Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. v1.0, v2.1"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stone-900"
                    value={formData.version}
                    onChange={e => setFormData({ ...formData, version: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Description / Study Summary
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide a summary of the findings, standard guidelines, or intended usage..."
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 resize-none"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. NABH, Tele-calling, Conversion, SOP"
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                  value={formData.tags}
                  onChange={e => setFormData({ ...formData, tags: e.target.value })}
                />
              </div>

              {/* File Dropzone */}
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Attach Document / Study File
                </label>
                <div className="border-2 border-dashed border-stone-200 rounded-2xl p-6 text-center hover:border-stone-400 transition-colors bg-stone-50/50 relative">
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex flex-col items-center">
                    <Upload className="w-8 h-8 text-stone-400 mb-2" />
                    {formData.fileName ? (
                      <div>
                        <p className="text-sm font-bold text-stone-900">{formData.fileName}</p>
                        <p className="text-xs text-stone-500 font-mono">{formData.fileType} • {formData.fileSize}</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm font-semibold text-stone-700">Click or drag & drop file here</p>
                        <p className="text-xs text-stone-400 mt-1">Supports PDF, DOCX, XLSX, PPTX, Images (Max 10MB)</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Created By Info Auto Banner */}
              <div className="p-3 bg-stone-100 rounded-xl flex items-center justify-between text-xs text-stone-600">
                <span><strong>Uploaded By:</strong> {currentUser.name} ({currentUser.role})</span>
                <span><strong>Date:</strong> {format(new Date(), 'MMM d, yyyy')}</span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || fileUploading}
                  className="px-6 py-2.5 rounded-xl bg-stone-900 text-white font-medium text-sm hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Sparkles className="w-4 h-4 animate-spin" />}
                  Save Resource
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Version Update Modal */}
      {isEditModalOpen && selectedResource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 lg:p-8 shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-stone-900 text-white rounded-2xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-serif font-bold text-stone-900">Update Resource / Bump Version</h2>
                  <p className="text-xs text-stone-400">Modify details or release a new version of this study.</p>
                </div>
              </div>
              <button 
                onClick={() => { setIsEditModalOpen(false); setSelectedResource(null); }}
                className="p-2 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateResource} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Document Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 cursor-pointer"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                  >
                    {CATEGORIES.filter(c => c !== 'All Categories').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                    Version Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. v2.0"
                    className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stone-900"
                    value={formData.version}
                    onChange={e => setFormData({ ...formData, version: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Description / Study Summary
                </label>
                <textarea
                  rows={3}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 resize-none"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-900"
                  value={formData.tags}
                  onChange={e => setFormData({ ...formData, tags: e.target.value })}
                />
              </div>

              {/* File Replace */}
              <div>
                <label className="block text-xs font-bold text-stone-600 uppercase mb-1">
                  Replace File (Optional)
                </label>
                <div className="border border-stone-200 rounded-xl p-3 bg-stone-50 flex items-center justify-between">
                  <div className="text-xs text-stone-600">
                    Current: <strong>{formData.fileName || 'Attached document'}</strong> ({formData.fileType})
                  </div>
                  <label className="px-3 py-1.5 bg-stone-900 text-white rounded-lg text-xs font-semibold cursor-pointer hover:bg-stone-800 transition-colors">
                    Upload New
                    <input type="file" onChange={handleFileChange} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Version & Author Footnote */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 text-xs text-amber-900">
                <p className="font-bold">Original Author: {selectedResource.createdByName} ({format(parseISO(selectedResource.createdAt), 'MMM d, yyyy')})</p>
                <p className="mt-0.5">Updating as: <strong>{currentUser.name}</strong> on {format(new Date(), 'MMM d, yyyy HH:mm')}</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setSelectedResource(null); }}
                  className="px-5 py-2.5 rounded-xl border border-stone-200 text-stone-600 font-medium text-sm hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || fileUploading}
                  className="px-6 py-2.5 rounded-xl bg-stone-900 text-white font-medium text-sm hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <Sparkles className="w-4 h-4 animate-spin" />}
                  Update & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview / Detail Modal */}
      {isPreviewModalOpen && selectedResource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 lg:p-8 shadow-2xl border border-stone-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-4 mb-6 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-stone-100 rounded-2xl text-stone-900">
                  {getFileIcon(selectedResource.fileType)}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border",
                      getCategoryBadgeClass(selectedResource.category)
                    )}>
                      {selectedResource.category}
                    </span>
                    <span className="text-xs font-mono font-bold bg-stone-900 text-white px-2 py-0.5 rounded-md">
                      {selectedResource.version || 'v1.0'}
                    </span>
                  </div>
                  <h2 className="text-xl font-serif font-bold text-stone-900">{selectedResource.title}</h2>
                </div>
              </div>

              <button 
                onClick={() => { setIsPreviewModalOpen(false); setSelectedResource(null); }}
                className="p-2 hover:bg-stone-100 rounded-full text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6 text-sm text-stone-700">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-stone-50 rounded-2xl border border-stone-100">
                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase">Created By</p>
                  <p className="font-semibold text-stone-900 mt-0.5">{selectedResource.createdByName}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase">Last Update</p>
                  <p className="font-semibold text-stone-900 mt-0.5">
                    {selectedResource.updatedAt ? format(parseISO(selectedResource.updatedAt), 'MMM d, yyyy HH:mm') : 'N/A'}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-stone-400 uppercase">File Specs</p>
                  <p className="font-mono text-stone-800 text-xs mt-0.5">
                    {selectedResource.fileType} {selectedResource.fileSize ? `(${selectedResource.fileSize})` : ''}
                  </p>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-stone-400 uppercase mb-2 tracking-wider">Resource Description / Summary</h4>
                <div className="p-4 bg-white rounded-2xl border border-stone-200 leading-relaxed text-stone-800 whitespace-pre-wrap font-sans">
                  {selectedResource.description || 'No detailed description provided.'}
                </div>
              </div>

              {/* Tags */}
              {selectedResource.tags && selectedResource.tags.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-stone-400 uppercase mb-2 tracking-wider">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedResource.tags.map((tag, idx) => (
                      <span key={idx} className="bg-stone-100 border border-stone-200 text-stone-700 px-3 py-1 rounded-xl text-xs font-medium flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-stone-400" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-6 mt-6 border-t border-stone-100">
              <div className="text-xs text-stone-400">
                Downloaded {selectedResource.downloadCount || 0} times
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setIsPreviewModalOpen(false); openEditModal(selectedResource); }}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 font-medium text-sm hover:bg-stone-50 transition-colors flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  Update Version
                </button>

                <button
                  onClick={() => handleDownload(selectedResource)}
                  className="px-6 py-2.5 rounded-xl bg-stone-900 text-white font-medium text-sm hover:bg-stone-800 transition-colors shadow-md flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download File
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
