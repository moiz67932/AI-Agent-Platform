import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Upload, LinkIcon, Trash2, Pencil, Copy,
  BookOpen, CheckCircle2, AlertCircle, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useKnowledge, useCreateArticle, useUpdateArticle, useDeleteArticle } from '@/hooks/useKnowledge';
import { relativeTime } from '@/lib/utils';
import { api } from '@/lib/api';
import type { KnowledgeArticle } from '@/types';

const CATEGORIES = ['FAQ', 'Services', 'Pricing', 'Policies', 'Hours', 'Location', 'Insurance', 'Pre/Post Care', 'Emergency', 'General'];

const STATUS_ICONS = {
  active: <CheckCircle2 className="h-3 w-3 text-emerald-500" />,
  draft: <Clock className="h-3 w-3 text-amber-500" />,
  processing: <AlertCircle className="h-3 w-3 text-blue-500" />,
};

function ArticleEditor({
  article,
  clinicId,
  onClose,
}: {
  article?: KnowledgeArticle;
  clinicId: string;
  onClose: () => void;
}) {
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle();
  const [title, setTitle] = useState(article?.title || '');
  const [body, setBody] = useState(article?.body || '');
  const [category, setCategory] = useState(article?.category || 'FAQ');
  const [status, setStatus] = useState<'active' | 'draft'>(
    (article?.status as 'active' | 'draft') || 'active'
  );

  const save = async () => {
    if (!title || !body) return;
    if (article) {
      await updateArticle.mutateAsync({ clinicId, id: article.id, title, body, category, status });
    } else {
      await createArticle.mutateAsync({ clinicId, title, body, category, status });
    }
    onClose();
  };

  const isPending = createArticle.isPending || updateArticle.isPending;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Title / Question</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are your hours?" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as 'active' | 'draft')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Answer / Body</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="We are open Monday through Friday, 9am to 5pm..."
          rows={6}
        />
        <div className="text-xs text-muted-foreground text-right">{body.length} chars</div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} disabled={isPending || !title || !body}>
          {isPending ? 'Saving...' : article ? 'Update Article' : 'Create Article'}
        </Button>
      </div>
    </div>
  );
}

function ArticleRow({ article, clinicId, onEdit }: { article: KnowledgeArticle; clinicId: string; onEdit: (a: KnowledgeArticle) => void }) {
  const deleteArticle = useDeleteArticle();
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-1.5">
        {STATUS_ICONS[article.status as keyof typeof STATUS_ICONS]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{article.title}</div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">{article.body.slice(0, 80)}...</div>
      </div>
      <Badge variant="outline" className="shrink-0 text-xs">{article.category}</Badge>
      <span className="text-xs text-muted-foreground shrink-0">{relativeTime(article.updated_at)}</span>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(article)}>
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive"
          onClick={() => setConfirmDel(true)}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Article</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Delete "{article.title}"? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDel(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { deleteArticle.mutate({ clinicId, id: article.id }); setConfirmDel(false); }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ScrapeStatus = 'idle' | 'pending' | 'processing' | 'done' | 'failed';

function ImportUrlTab({ clinicId }: { clinicId: string }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ScrapeStatus>('idle');
  const [articlesCreated, setArticlesCreated] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const startPolling = (id: string) => {
    stopPolling();
    intervalRef.current = setInterval(async () => {
      try {
        const res = await api.get<{ data: { status: string; articles_created: number; error: string | null } }>(
          `/api/knowledge/${clinicId}/scrape-status/${id}`
        );
        const job = res.data;
        if (job.status === 'done') {
          stopPolling();
          setJobStatus('done');
          setArticlesCreated(job.articles_created);
          queryClient.invalidateQueries({ queryKey: ['knowledge', clinicId] });
        } else if (job.status === 'failed') {
          stopPolling();
          setJobStatus('failed');
          setJobError(job.error);
        } else {
          setJobStatus(job.status as ScrapeStatus);
        }
      } catch {
        // Keep polling — transient network error
      }
    }, 2000);
  };

  const importFromUrl = async () => {
    if (!url) return;
    setJobStatus('pending');
    setJobError(null);
    try {
      const res = await api.post<{ jobId: string }>(`/api/knowledge/${clinicId}/import-url`, { url });
      setJobId(res.jobId);
      startPolling(res.jobId);
    } catch (err: unknown) {
      setJobStatus('failed');
      setJobError(err instanceof Error ? err.message : 'Failed to start import');
    }
  };

  const reset = () => {
    stopPolling();
    setJobId(null);
    setJobStatus('idle');
    setJobError(null);
    setUrl('');
  };

  const errorMessage = () => {
    if (jobError === 'robots_disallowed') return "This website doesn't allow scraping";
    if (jobError === 'timeout') return 'The page took too long to load';
    return 'Failed to import. Check the URL and try again.';
  };

  const isWorking = jobStatus === 'pending' || jobStatus === 'processing';

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Enter your website URL to import content automatically.</p>
      <div className="flex gap-2">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourclinic.com/faq"
          disabled={isWorking}
          onKeyDown={(e) => e.key === 'Enter' && !isWorking && url && importFromUrl()}
        />
        <Button onClick={importFromUrl} disabled={!url || isWorking || jobStatus === 'done'}>
          <LinkIcon className="h-4 w-4 mr-2" />
          {isWorking ? 'Importing...' : 'Import'}
        </Button>
      </div>

      {isWorking && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
          {jobStatus === 'pending' ? 'Starting scrape...' : 'Scraping page content...'}
        </div>
      )}

      {jobStatus === 'done' && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Imported {articlesCreated} article{articlesCreated !== 1 ? 's' : ''}
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={reset}>Import another</Button>
        </div>
      )}

      {jobStatus === 'failed' && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            {errorMessage()}
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={reset}>Try again</Button>
        </div>
      )}
    </div>
  );
}

function ImportSection({ clinicId }: { clinicId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Tabs defaultValue="file">
      <TabsList>
        <TabsTrigger value="file">Upload File</TabsTrigger>
        <TabsTrigger value="url">Import URL</TabsTrigger>
        <TabsTrigger value="template">Templates</TabsTrigger>
      </TabsList>

      <TabsContent value="file" className="mt-4">
        <div
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-10 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <div className="font-medium text-sm">Drop files here or click to browse</div>
          <div className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT — up to 10MB</div>
          <div className="flex gap-2 mt-3">
            <Badge variant="secondary">PDF</Badge>
            <Badge variant="secondary">DOCX</Badge>
            <Badge variant="secondary">TXT</Badge>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" />
        </div>
      </TabsContent>

      <TabsContent value="url" className="mt-4">
        <ImportUrlTab clinicId={clinicId} />
      </TabsContent>

      <TabsContent value="template" className="mt-4">
        <div className="grid gap-2">
          {['Standard Dental FAQ Pack', 'Med Spa Policies Template', 'Business Hours Template', 'Payment & Insurance FAQ'].map((t) => (
            <div key={t} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
              <span className="text-sm font-medium">{t}</span>
              <Button size="sm" variant="outline">Use Template</Button>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}

export default function KnowledgeBase() {
  const { id: clinicId } = useParams<{ id: string }>();
  const { data: articles, isLoading } = useKnowledge(clinicId!);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | undefined>();
  const [showEditor, setShowEditor] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const filtered = (articles || []).filter((a) => {
    const matchSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.body.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'All' || a.category === activeCategory;
    return matchSearch && matchCat;
  });

  const categoryCounts = (articles || []).reduce<Record<string, number>>((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});

  const openEditor = (article?: KnowledgeArticle) => {
    setEditingArticle(article);
    setShowEditor(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {articles?.length || 0} articles • Last updated {articles?.[0] ? relativeTime(articles[0].updated_at) : 'never'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(!showImport)}>
            <Upload className="h-4 w-4 mr-2" />Import
          </Button>
          <Button onClick={() => openEditor()}>
            <Plus className="h-4 w-4 mr-2" />Add Article
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Category Sidebar */}
        <div className="w-52 shrink-0 space-y-1">
          <button
            onClick={() => setActiveCategory('All')}
            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              activeCategory === 'All' ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            <span>All Articles</span>
            <span className="font-mono text-xs">{articles?.length || 0}</span>
          </button>
          {CATEGORIES.filter((c) => categoryCounts[c]).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                activeCategory === cat ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <span>{cat}</span>
              <span className="font-mono text-xs">{categoryCounts[cat]}</span>
            </button>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles..."
              className="pl-9"
            />
          </div>

          {/* Import panel */}
          <AnimatePresence>
            {showImport && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <Card>
                  <CardHeader className="pb-2 flex-row items-center justify-between">
                    <CardTitle className="text-sm">Import Content</CardTitle>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowImport(false)}>
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ImportSection clinicId={clinicId!} />
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Article list */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !filtered.length ? (
            <EmptyState
              icon={BookOpen}
              title={search ? 'No articles match your search' : 'No articles yet'}
              description={search ? 'Try a different search term' : 'Add FAQs and information your agent should know'}
              actionLabel={search ? undefined : 'Add First Article'}
              onAction={search ? undefined : () => openEditor()}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((article) => (
                <ArticleRow
                  key={article.id}
                  article={article}
                  clinicId={clinicId!}
                  onEdit={openEditor}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Article Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingArticle ? 'Edit Article' : 'New Article'}</DialogTitle>
          </DialogHeader>
          {showEditor && (
            <ArticleEditor
              article={editingArticle}
              clinicId={clinicId!}
              onClose={() => { setShowEditor(false); setEditingArticle(undefined); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
