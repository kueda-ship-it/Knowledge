import React, { useState, useEffect, useRef } from 'react';
import { KnowledgeItem, MasterData, Attachment, ProposalDraft, ReactionType } from '../types';
import { Trash2, X, RotateCcw, Check, Paperclip, ExternalLink, FileText, Image, ShieldCheck, ShieldAlert, AlertTriangle, Clock, History, MessageSquare, AlertOctagon, Send, Sparkles, Pen } from 'lucide-react';
import { ReactionBar } from './ReactionBar';
import { KnowledgeComments } from './KnowledgeComments';
import { applyReactionToggle, reactionCountsOf, reactionUsersOf } from '../constants/reactions';
import { apiClient } from '../api/client';
import { useOneDriveUpload } from '../hooks/useOneDriveUpload';
import { EditHistory } from '../types';
import { GlassSelect } from './common/GlassSelect';
import { isManagerOrAbove } from '../constants/roles';
import { TagInput } from './common/TagInput';
import { TagStat } from '../utils/tagUtils';
import { EncodedImage, encodeImageForExtraction, extractKnowledgeFromImages, mergeDraft, currentFromForm } from '../utils/screenshotExtract';
import { EditorSnapshot, StoredDraft, isDirty, hasContent, saveDraft, loadDraft, clearDraft } from '../utils/editorDraft';
import { getToken } from '../lib/microsoftGraph';
import { GlassModal } from './common/GlassModal';
import {
    Aspect, AspectIssue, ASPECT_META, ASPECT_ORDER, QualityInput, checkByRule, checkByAi,
} from '../utils/knowledge5w1h';

interface EditorProps {
    item: KnowledgeItem | null;
    masters: MasterData;
    onSave: (data: any, shouldClose?: boolean) => void;
    onDelete: (id: string) => void;
    onCancel: () => void;
    user: { name: string, role: string, email?: string };
    existingTags?: TagStat[];
    // AI チャット経由で渡されたスクショ (OneDrive アップロード + 追加抽出に使う)
    initialFiles?: File[] | null;
    // 「提議に展開」ボタンを押した時のフック。親 (App) が提議画面に遷移して下書きを開く。
    onDispatchToProposal?: (draft: ProposalDraft) => void;
}

export const Editor: React.FC<EditorProps> = ({ item, masters, onSave, onDelete, onCancel, user, existingTags = [], initialFiles, onDispatchToProposal }) => {
    const [formData, setFormData] = useState<Partial<KnowledgeItem>>({
        title: '', machine: '', property: '', req_num: '',
        category: '', incidents: [], tags: [], content: '',
        phenomenon: '', countermeasure: '',
        status: 'unsolved',
        claimLevel: 0,
    });
    const [selectedIncidents, setSelectedIncidents] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingProperty, setFetchingProperty] = useState(false);
    const [history, setHistory] = useState<EditHistory[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [showWrongDialog, setShowWrongDialog] = useState(false);
    const [wrongComment, setWrongComment] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- 5W1H 充足判定 (起票ガード) ---
    // 不足があるとここに入り、保存を止めてダイアログを出す
    const [qualityIssues, setQualityIssues] = useState<AspectIssue[] | null>(null);
    // AI 判定中 (ルール判定は同期なのでフラグ不要)
    const [checking, setChecking] = useState(false);

    // --- 閉じる確認 / 下書き復元 ---
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    // 新規作成で開いたときに復元できる前回の下書き (バナーで提示、押されるまで反映しない)
    const [restorable, setRestorable] = useState<StoredDraft | null>(null);
    // 未保存判定の基準。item 読み込み直後 / 下書き復元直後の状態を入れる
    const baselineRef = useRef<EditorSnapshot | null>(null);
    const draftUserKey = user.email || user.name;
    const isNewEditor = !item?.id;

    const { uploadFile, uploading, statusMessage, isAuthenticated, authenticate } = useOneDriveUpload(user.email as string | undefined);

    // --- スクショ AI 読み取り ---
    const [aiState, setAiState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle');
    const [aiNote, setAiNote] = useState('');
    // セッション中に貼られた全画像 (毎回まとめて統合読み取りする)
    const aiImagesRef = useRef<EncodedImage[]>([]);
    // ユーザーが status を手動で切り替えたか (true なら AI 判定で status を動かさない)
    const statusTouchedRef = useRef(false);
    // 並行抽出の競合対策: 最後に発行したリクエストの結果だけ反映する
    const extractSeqRef = useRef(0);
    // formData 等の最新値を抽出コールバックから参照するための ref
    const latestFormRef = useRef({ formData, selectedIncidents, tagInput });
    latestFormRef.current = { formData, selectedIncidents, tagInput };

    useEffect(() => {
        if (item) {
            const nextForm = {
                ...item,
                phenomenon: item.phenomenon ?? '',
                countermeasure: item.countermeasure ?? '',
            };
            setFormData(nextForm);
            setSelectedIncidents(item.incidents || []);
            setTagInput((item.tags || []).join(' #'));
            setAttachments(item.attachments || []);
            baselineRef.current = {
                formData: nextForm,
                selectedIncidents: item.incidents || [],
                tagInput: (item.tags || []).join(' #'),
                attachments: item.attachments || [],
            };
            // 履歴取得 (新規作成 (id 空) のときはスキップ)
            if (item.id) {
                apiClient.fetchHistory(item.id).then(setHistory).catch(console.error);
            } else {
                setHistory([]);
            }
        } else {
            const nextForm: Partial<KnowledgeItem> = {
                title: '', machine: '', property: '', req_num: '',
                category: '', incidents: [], tags: [], content: '',
                phenomenon: '', countermeasure: '',
                status: 'unsolved',
                claimLevel: 0,
            };
            setFormData(nextForm);
            setSelectedIncidents([]);
            setTagInput('');
            setAttachments([]);
            setHistory([]);
            baselineRef.current = { formData: nextForm, selectedIncidents: [], tagInput: '', attachments: [] };
        }
        // 前回「下書きを残して閉じる」を選んでいたら、新規エディタでのみ復元バナーを出す。
        // 既存ナレッジの編集画面に他案件の下書きを持ち込むと事故になるので出さない。
        setRestorable(!item?.id ? loadDraft(draftUserKey) : null);
        setShowCloseConfirm(false);
        aiImagesRef.current = [];
        setAiState('idle');
        setAiNote('');
        // 既存ナレッジの status は投稿者の判断済みの値なので AI で勝手に動かさない
        statusTouchedRef.current = !!item?.id;
    }, [item]);

    const canEdit = !item ||
        isManagerOrAbove(user.role) ||
        (user.role === 'user' && item.author === user.name);

    useEffect(() => {
        if (item) {
            console.log("Permission check:", {
                user: user.name,
                author: item.author,
                role: user.role,
                canEdit
            });
        }
    }, [item, user, canEdit]);

    if (!canEdit && item) {
        // Just show read-only or similar, but for now we might just let it be readonly inputs
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { id, value } = e.target;
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const handleIncidentAdd = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val && !selectedIncidents.includes(val)) {
            setSelectedIncidents([...selectedIncidents, val]);
        }
        e.target.value = '';
    };

    const removeIncident = (val: string) => {
        setSelectedIncidents(selectedIncidents.filter(i => i !== val));
    };

    // 5W1H 判定。不足があればダイアログを出して false を返す。
    // ルール判定 (即時) で欠落が出た時点で AI は呼ばない。AI 判定が落ちた場合は
    // ルールを通っているので起票を通す (AI 障害で業務を止めない)。
    const runQualityGate = async (): Promise<boolean> => {
        const input: QualityInput = {
            title: formData.title,
            property: formData.property,
            machine: formData.machine,
            req_num: formData.req_num,
            category: formData.category,
            recordType: formData.recordType ?? 'trouble',
            phenomenon: formData.phenomenon,
            countermeasure: formData.countermeasure,
            author: item?.author || user.name,
        };

        const ruleIssues = checkByRule(input);
        if (ruleIssues.length > 0) {
            setQualityIssues(ruleIssues);
            return false;
        }

        setChecking(true);
        try {
            const aiIssues = await checkByAi(input);
            if (aiIssues.length > 0) {
                setQualityIssues(aiIssues);
                return false;
            }
            return true;
        } catch (e: any) {
            console.warn('5W1H の AI 判定をスキップしました:', e?.message || e);
            return true;
        } finally {
            setChecking(false);
        }
    };

    // 不足指摘の該当欄にカーソルを移す
    const focusAspectField = (aspect: Aspect) => {
        const el = document.getElementById(ASPECT_META[aspect].field) as HTMLElement | null;
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void submitKnowledge(false);
    };

    // skipQualityGate=true は manager 以上が「不足を承知で登録」を押した場合のみ
    const submitKnowledge = async (skipQualityGate: boolean) => {
        const isConstruction = formData.category?.toLowerCase() === 'construction';
        
        // Basic validation
        const hasMachine = !!formData.machine;
        const hasProperty = !!formData.property;
        const hasPhenomenon = !!formData.phenomenon;
        const hasCountermeasure = !!formData.countermeasure;
        const hasIncidents = selectedIncidents.length > 0;
        const hasCategory = !!formData.category;
        const hasValidReqNum = isConstruction ? true : /^\d{11}$/.test(formData.req_num || '');

        if (!hasMachine || !hasProperty || (!isConstruction && !formData.req_num) || !hasPhenomenon || !hasCountermeasure || !hasIncidents || !hasCategory) {
            return alert("必須項目(*)をすべて入力してください");
        }
        
        if (!hasValidReqNum) {
            return alert("依頼番号は半角数字11桁で入力してください");
        }

        // 5W1H が読み取れない起票は止める。
        // ガードは新規起票のみ。既存ナレッジの軽微な修正 (誤字直し・ステータス変更) まで
        // 止めると運用が回らないため、編集時は従来どおり必須チェックだけで通す。
        if (isNewEditor && !skipQualityGate) {
            const passed = await runQualityGate();
            if (!passed) return;
        }

        // 半角 # / 全角 ＃ / 音楽記号 ♯ のいずれでも区切れるように正規化
        const tags = tagInput
            .split(/[#＃♯]/)
            .map(t => t.trim())
            .filter(t => t);
        let title = formData.title?.trim();
        if (!title) title = `[${formData.category}] ${selectedIncidents.join(', ')}`;

        const phenomenon = formData.phenomenon || '';
        const countermeasure = formData.countermeasure || '';
        const content = phenomenon && countermeasure ? `${phenomenon}\n\n【対処】\n${countermeasure}` : (phenomenon || countermeasure || formData.content || '');

        // 既存編集 vs 新規作成の判定。AI チャットからの下書き (initialNewDraft) は
        // item に値が入っているが id は空文字なので、これも新規扱いにする。
        const isNew = !item?.id;
        const payload: KnowledgeItem = {
            id: item?.id || Date.now().toString(),
            machine: formData.machine || '',
            property: formData.property || '',
            req_num: formData.req_num || '',
            title: title,
            category: formData.category || '',
            incidents: selectedIncidents,
            tags: tags,
            content: content,
            phenomenon,
            countermeasure,
            status: formData.status || 'unsolved',
            recordType: formData.recordType || 'trouble',
            // 既存編集時は元の作成日時を保持。新規時のみ undefined (DB の default で created_at が入る)
            createdAt: item?.createdAt,
            updatedAt: new Date().toISOString(),
            // 投稿者 (author) は新規作成時のみ現ユーザー。既存編集では元の投稿者を保持する。
            author: item?.author || user.name,
            // 最終更新者は毎回現ユーザー (status/content/title 以外の編集でも正確に追跡するため専用列で保持)
            updatedBy: user.name,
            // クレーム強度 (1-10)。インシデント (クレーム案件) のみ有効、トラブルは常に 0
            claimLevel: (formData.recordType ?? 'trouble') === 'incident'
                ? Math.max(0, Math.min(10, Math.round(formData.claimLevel ?? 0)))
                : 0,
            attachments,
        };

        setLoading(true);
        try {
            // 30秒でタイムアウト（ネットワーク不安定時にハング防止）
            await Promise.race([
                apiClient.save(payload, isNew ? undefined : (item || undefined)),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 30000))
            ]);
            // 保存できた時点で下書きは役目を終える (残すと次の新規作成で復元バナーが出て紛らわしい)
            clearDraft(draftUserKey);
            onSave(payload);
        } catch (e: any) {
            const msg = e?.message === 'TIMEOUT'
                ? '保存がタイムアウトしました。ネットワークを確認して再試行してください。'
                : `保存失敗: ${e?.message || '不明なエラー'}`;
            alert(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleReaction = async (type: ReactionType, comment?: string) => {
        if (!item || !user.name) return;
        const userId = (user as any).id;
        if (!userId) return alert("ユーザーIDが見つかりません");

        // --- 楽観的UI更新 (Optimistic Update)。元の状態はロールバック用に保持 ---
        const originalItem = { ...item };
        const newItem = applyReactionToggle(item, type, userId);

        // 先にUIを更新して体感速度を上げる
        if (onSave) onSave(newItem, false);

        // バックグラウンドでサーバー更新 (15秒タイムアウトでハング防止)
        try {
            await Promise.race([
                apiClient.toggleReaction(item.id, userId, type, comment),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 15000)),
            ]);
        } catch (e) {
            console.error("Reaction failed:", e);
            alert("リアクションの同期に失敗しました。再試行してください。");
            // ロールバック
            if (onSave) onSave(originalItem, false);
        }
    };

    const handleDelete = async () => {
        if (!item?.id) return;
        if (!confirm("本当に削除しますか？")) return;
        setLoading(true);
        try {
            await apiClient.delete(item.id);
            onDelete(item.id);
        } catch (e) {
            alert("削除失敗");
        } finally {
            setLoading(false);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        e.target.value = ''; // 同じファイルを再選択できるようリセット

        await handleIncomingFiles(files);
    };

    const handleMachineBlur = async () => {
        if (!formData.machine || formData.property) return; // すでに物件名がある場合は自動上書きしない（または空の場合のみ）
        
        setFetchingProperty(true);
        try {
            const name = await apiClient.fetchPropertyNameByMachine(formData.machine);
            if (name) {
                setFormData(prev => ({ ...prev, property: name }));
            }
        } finally {
            setFetchingProperty(false);
        }
    };

    const removeAttachment = (id: string) => {
        setAttachments(prev => prev.filter(a => a.id !== id));
    };

    // 貼られた全画像 + 現在の入力値で extract-knowledge を呼び、空欄フィールドにのみ反映する
    const runExtraction = async () => {
        const images = aiImagesRef.current.slice(-5); // 抽出対象は直近 5 枚まで
        if (images.length === 0) return;
        const seq = ++extractSeqRef.current;
        setAiState('reading');
        setAiNote('');
        try {
            const { formData: fd, selectedIncidents: inc, tagInput: ti } = latestFormRef.current;
            const current = currentFromForm(fd, inc, ti);
            const draft = await extractKnowledgeFromImages(images, current, {
                categories: masters.categories,
                incidents: masters.incidents,
            });
            if (seq !== extractSeqRef.current) return; // 後続リクエストがあるので破棄
            const latest = latestFormRef.current;
            const merged = mergeDraft(
                currentFromForm(latest.formData, latest.selectedIncidents, latest.tagInput),
                draft,
                statusTouchedRef.current,
            );
            const { tags, incidents, ...formFields } = merged;
            if (Object.keys(formFields).length > 0) {
                setFormData(prev => ({ ...prev, ...formFields }));
            }
            if (incidents) setSelectedIncidents(incidents);
            if (tags) setTagInput(tags.join(' #'));
            setAiState('done');
            setTimeout(() => setAiState(s => (s === 'done' ? 'idle' : s)), 4000);
        } catch (e: any) {
            if (seq !== extractSeqRef.current) return;
            console.warn('[extract-knowledge] failed:', e);
            setAiState('error');
            setAiNote(e?.message === 'EXTRACT_TIMEOUT' ? '読み取りがタイムアウトしました' : (e?.message || '読み取りに失敗しました'));
        }
    };

    // 貼り付け / D&D / ファイル選択で入ってきたファイルの共通処理。
    // 画像は「OneDrive 添付 (認証済みの場合)」と「AI 読み取り」の両方に流す。
    const handleIncomingFiles = async (files: File[]) => {
        if (!canEdit || files.length === 0) return;

        const imageFiles = files.filter(f => f.type.startsWith('image/'));
        // 画像の base64 化は先に済ませて即読み取りを開始する (アップロードを待たない)
        if (imageFiles.length > 0) {
            try {
                const encoded = await Promise.all(imageFiles.map(encodeImageForExtraction));
                aiImagesRef.current = [...aiImagesRef.current, ...encoded];
                runExtraction();
            } catch (e) {
                console.warn('[encodeImage] failed:', e);
            }
        }

        // isAuthenticated state はマウント直後に確定していないことがあるためトークンを直接確認
        const token = await getToken().catch(() => null);
        if (token) {
            for (const file of files) {
                const att = await uploadFile(file);
                if (att) setAttachments(prev => [...prev, att]);
            }
        } else {
            setAiNote('OneDrive 未認証のため添付には追加されていません (Microsoft認証後に「ファイルを追加」から添付できます)');
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;
        e.preventDefault();
        handleIncomingFiles(files);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) handleIncomingFiles(files);
    };

    // AI チャット経由のスクショ (initialFiles) を一度だけ処理する
    const initialFilesConsumedRef = useRef(false);
    useEffect(() => {
        if (initialFilesConsumedRef.current) return;
        if (initialFiles && initialFiles.length > 0) {
            initialFilesConsumedRef.current = true;
            handleIncomingFiles(initialFiles);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFiles]);

    // --- 閉じる確認 / 下書き ---
    const snapshot = (): EditorSnapshot => ({ formData, selectedIncidents, tagInput, attachments });

    // 新規作成中は入力を自動保存する。誤ってタブを閉じた / リロードした場合でも
    // 次に新規作成を開いたときに「続きから再開」できる。
    // 空フォームでは保存しない (未復元の下書きを空で上書きしてしまうため)。
    useEffect(() => {
        if (!isNewEditor) return;
        const snap: EditorSnapshot = { formData, selectedIncidents, tagInput, attachments };
        if (!hasContent(snap)) return;
        const timer = setTimeout(() => saveDraft(snap, draftUserKey), 800);
        return () => clearTimeout(timer);
    }, [formData, selectedIncidents, tagInput, attachments, isNewEditor, draftUserKey]);

    // × を押したとき。未保存の変更が無ければそのまま閉じる (毎回確認するのは煩わしいので)
    const handleCloseRequest = () => {
        const base = baselineRef.current;
        if (!base || !isDirty(snapshot(), base)) return onCancel();
        setShowCloseConfirm(true);
    };

    const closeDiscarding = () => {
        clearDraft(draftUserKey);
        setShowCloseConfirm(false);
        onCancel();
    };

    const restoreDraft = () => {
        if (!restorable) return;
        setFormData(restorable.formData);
        setSelectedIncidents(restorable.selectedIncidents);
        setTagInput(restorable.tagInput);
        setAttachments(restorable.attachments);
        // 復元直後を基準にする。ここから何も触らずに閉じたら確認は出さない
        baselineRef.current = {
            formData: restorable.formData,
            selectedIncidents: restorable.selectedIncidents,
            tagInput: restorable.tagInput,
            attachments: restorable.attachments,
        };
        // 復元した status は本人が選んだ値なので AI 判定で上書きしない
        statusTouchedRef.current = true;
        setRestorable(null);
    };

    const discardRestorable = () => {
        clearDraft(draftUserKey);
        setRestorable(null);
    };

    // 種別に応じて区分/詳細セレクトのラベル接頭辞を切り替える (トラブル区分 / インシデント区分)
    const typeLabel = (formData.recordType ?? 'trouble') === 'incident' ? 'インシデント' : 'トラブル';

    return (
        <div style={{ padding: '20px' }} onPaste={handlePaste} onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                    <Pen size={18} /> ナレッジ編集
                </h3>
                <button onClick={handleCloseRequest} className="secondary-btn" title="閉じる" style={{ width: '36px', height: '36px', padding: 0 }}>
                    <X size={18} />
                </button>
            </div>

            {/* Reaction Section (Only for existing items) */}
            {item && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    padding: '20px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '16px',
                    border: '1px solid var(--glass-border)',
                    marginBottom: '25px',
                    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)'
                }}>
                    <ReactionBar
                        variant="full"
                        counts={reactionCountsOf(item)}
                        users={reactionUsersOf(item)}
                        myReaction={item.myReaction}
                        usersMaster={masters.users}
                        onToggle={(type) => {
                            // 「違うよ」は指摘内容の入力ダイアログを挟む (取り消しは即時)
                            if (type === 'wrong' && item.myReaction !== 'wrong') {
                                setShowWrongDialog(true);
                                return;
                            }
                            handleReaction(type);
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setShowHistory(!showHistory)}
                        className="secondary-btn"
                        style={{ borderRadius: '40px', padding: '12px 24px', gap: '8px' }}
                    >
                        <History size={18} /> {showHistory ? '詳細を隠す' : '履歴を表示'}
                    </button>
                </div>
            )}

            {/* コメントスレッド (既存ナレッジのみ) */}
            {item && item.id && (
                <div style={{ marginBottom: '25px' }}>
                    <KnowledgeComments knowledgeId={item.id} user={user} usersMaster={masters.users} />
                </div>
            )}

            {showWrongDialog && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex',
                    alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="login-box" style={{ width: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                            <AlertTriangle size={20} /> どこが違いますか？
                        </h3>
                        <textarea 
                            value={wrongComment}
                            onChange={(e) => setWrongComment(e.target.value)}
                            placeholder="具体的な修正箇所や指摘内容を入力してください..."
                            style={{ width: '100%', height: '120px', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button 
                                onClick={() => { handleReaction('wrong', wrongComment); setShowWrongDialog(false); setWrongComment(''); }}
                                className="primary-btn" style={{ flex: 1, background: '#ef4444' }}
                            >
                                送信する
                            </button>
                            <button onClick={() => setShowWrongDialog(false)} className="secondary-btn" style={{ flex: 1 }}>キャンセル</button>
                        </div>
                    </div>
                </div>
            )}

            {showCloseConfirm && (
                <div
                    onClick={() => setShowCloseConfirm(false)}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
                        background: 'rgba(2, 6, 23, 0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            // box-sizing は input 系にしか効いていないので明示する (狭い画面でカードがはみ出すため)
                            width: '100%', maxWidth: '340px', padding: '22px', boxSizing: 'border-box',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
                            textAlign: 'center', borderRadius: '16px',
                            background: 'var(--card-bg)', border: '1px solid var(--glass-border)',
                            backdropFilter: 'blur(20px)',
                            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.45)',
                        }}
                    >
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(245, 158, 11, 0.15)',
                            border: '1px solid rgba(245, 158, 11, 0.45)',
                            boxShadow: '0 0 20px rgba(245, 158, 11, 0.25)',
                        }}>
                            <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
                        </div>

                        <div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>
                                保存せずに閉じますか？
                            </div>
                            <div style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--muted)' }}>
                                入力中の内容はまだ保存されていません。
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                            <button
                                type="button" onClick={() => setShowCloseConfirm(false)} className="secondary-btn"
                                style={{ flex: 1, height: '38px', boxSizing: 'border-box', padding: '0 12px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                            >
                                編集に戻る
                            </button>
                            <button
                                type="button" onClick={closeDiscarding}
                                style={{
                                    flex: 1, height: '38px', boxSizing: 'border-box', padding: '0 12px', fontSize: '0.85rem',
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', lineHeight: 1,
                                    borderRadius: '8px', cursor: 'pointer',
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    border: '1px solid rgba(239, 68, 68, 0.5)',
                                    color: '#fca5a5',
                                }}
                            >
                                <Trash2 size={12} /> 破棄して閉じる
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Change History with Diff */}
            {showHistory && item && (
                <div style={{
                    marginBottom: '25px', padding: '20px', background: 'var(--card-bg)',
                    borderRadius: '12px', border: '1px solid var(--glass-border)',
                }}>
                    <h4 style={{ margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} /> 変更履歴 (差分)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {history.length > 0 ? history.map(h => (
                            <div key={h.id} style={{ borderLeft: '2px solid var(--primary)', paddingLeft: '15px', position: 'relative' }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: '4px' }}>
                                    <strong>{h.changedBy}</strong> • <span className="num">{new Date(h.updatedAt).toLocaleString()}</span>
                                </div>
                                <div style={{ fontSize: '0.85rem', marginBottom: '8px', padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: '4px' }}>
                                    <MessageSquare size={12} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                                    {h.comment || '内容を更新しました'}
                                </div>
                                <DiffView oldText={h.oldContent} newText={h.newContent} />
                            </div>
                        )) : (
                            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)', fontSize: '0.9rem' }}>
                                履歴はありません
                            </div>
                        )}
                    </div>
                </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* 前回「下書きを残して閉じる」した内容の復元。押されるまでフォームには反映しない */}
                {restorable && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '10px 14px', borderRadius: '10px',
                        background: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        fontSize: '0.85rem',
                    }}>
                        <History size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                            作成途中の下書きがあります
                            {restorable.savedAt && (
                                <span style={{ color: 'var(--muted)' }}>
                                    （<span className="num">{new Date(restorable.savedAt).toLocaleString()}</span>）
                                </span>
                            )}
                        </span>
                        <button
                            type="button" onClick={restoreDraft} className="primary-btn"
                            style={{ height: '28px', boxSizing: 'border-box', padding: '0 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px', lineHeight: 1, flexShrink: 0 }}
                        >
                            <RotateCcw size={12} /> 続きから再開
                        </button>
                        <button
                            type="button" onClick={discardRestorable} className="secondary-btn"
                            style={{ height: '28px', boxSizing: 'border-box', padding: '0 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px', lineHeight: 1, flexShrink: 0 }}
                        >
                            <X size={12} /> 破棄
                        </button>
                    </div>
                )}

                {/* スクショ AI 読み取りステータス (FC 報告画面などを Ctrl+V / D&D で貼ると自動抽出) */}
                {(aiState !== 'idle' || aiNote) && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '10px 14px', borderRadius: '10px',
                        background: aiState === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                        border: `1px solid ${aiState === 'error' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)'}`,
                        fontSize: '0.85rem',
                        color: aiState === 'error' ? '#fca5a5' : 'var(--text)',
                    }}>
                        <Sparkles size={16} style={{
                            color: aiState === 'error' ? '#ef4444' : '#818cf8', flexShrink: 0,
                            animation: aiState === 'reading' ? 'pulse 1.2s ease-in-out infinite' : 'none',
                        }} />
                        <span>
                            {aiState === 'reading' && 'AI がスクリーンショットを読み取り中…'}
                            {aiState === 'done' && '読み取り完了 — 内容を確認してください'}
                            {aiState === 'error' && `AI 読み取り失敗: ${aiNote}`}
                            {aiState === 'idle' && aiNote}
                        </span>
                        <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
                    </div>
                )}

                {/* 種別 (トラブル / インシデント)。区分/詳細のラベルはこの選択に連動する */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 'bold', minWidth: '36px' }}>種別</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {([
                            { value: 'trouble', label: 'トラブル', rgb: '245, 158, 11' },
                            { value: 'incident', label: 'インシデント', rgb: '239, 68, 68' },
                        ] as const).map(opt => {
                            const active = (formData.recordType ?? 'trouble') === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setFormData(p => ({
                                        ...p,
                                        recordType: opt.value,
                                        // インシデント=クレーム案件なので強度必須 (未設定なら Lv.1)。トラブルは強度なし
                                        claimLevel: opt.value === 'incident' ? ((p.claimLevel ?? 0) > 0 ? p.claimLevel : 1) : 0,
                                    }))}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        height: '32px', padding: '0 16px', boxSizing: 'border-box',
                                        borderRadius: '20px', cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1,
                                        fontWeight: active ? 700 : 400,
                                        background: active ? `rgba(${opt.rgb}, 0.22)` : 'rgba(255,255,255,0.05)',
                                        color: active ? `rgb(${opt.rgb})` : 'var(--muted)',
                                        border: `1px solid ${active ? `rgba(${opt.rgb}, 0.65)` : 'rgba(255,255,255,0.15)'}`,
                                    }}
                                >
                                    {active && <Check size={12} />}
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>トラブル = 通常の障害対応 / インシデント = クレーム案件</span>
                </div>

                {/* クレーム強度 (1-10)。インシデント = クレーム案件のときだけ表示。数値が上がるほど赤が濃くなる */}
                {(formData.recordType ?? 'trouble') === 'incident' && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '12px 14px',
                        background: `rgba(239, 68, 68, ${0.04 + 0.012 * (formData.claimLevel ?? 0)})`,
                        border: `1px solid rgba(239, 68, 68, ${0.25 + 0.04 * (formData.claimLevel ?? 0)})`,
                        borderRadius: '10px',
                        transition: 'all 0.18s ease',
                    }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', minWidth: '110px' }}>
                            <AlertOctagon size={16} style={{ color: '#ef4444' }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fca5a5' }}>クレーム強度</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', flex: 1 }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(lv => {
                                const active = (formData.claimLevel ?? 0) === lv;
                                // 強度に応じて赤の濃さを変える (1=薄、10=濃)
                                const intensity = lv / 10;
                                return (
                                    <button
                                        key={lv}
                                        type="button"
                                        onClick={() => setFormData(p => ({ ...p, claimLevel: lv }))}
                                        className="cursor-hint-pill"
                                        title={`クレーム Lv.${lv}`}
                                        style={{
                                            height: '28px', minWidth: '32px',
                                            padding: '0 10px',
                                            boxSizing: 'border-box', lineHeight: 1,
                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                            background: active ? `rgba(239, 68, 68, ${0.35 + 0.5 * intensity})` : `rgba(239, 68, 68, ${0.06 + 0.08 * intensity})`,
                                            border: `1px solid ${active ? `rgba(239, 68, 68, ${0.7 + 0.3 * intensity})` : `rgba(239, 68, 68, ${0.25 + 0.05 * intensity})`}`,
                                            color: active ? '#fff' : '#fca5a5',
                                            borderRadius: '10px', cursor: 'pointer',
                                            fontSize: '0.82rem', fontWeight: active ? 700 : 400,
                                            whiteSpace: 'nowrap',
                                            boxShadow: active ? `0 0 ${8 + 12 * intensity}px rgba(239,68,68,${0.3 + 0.3 * intensity})` : 'none',
                                        }}
                                    >
                                        {lv}
                                    </button>
                                );
                            })}
                        </div>
                        {/* 提議に展開ボタン (権限ある人かつ既存ナレッジで、展開先 callback がある時のみ表示) */}
                        {item?.id && onDispatchToProposal && user.role !== 'viewer' && (
                            <button
                                type="button"
                                onClick={() => {
                                    const lv = formData.claimLevel ?? 0;
                                    const prefix = lv > 0 ? `[クレーム${lv >= 7 ? '・重大' : ''}] ` : '';
                                    const baseTitle = (formData.title?.trim()) || `[${formData.category}] ${selectedIncidents.join(', ')}`;
                                    const titleWithPrefix = baseTitle.startsWith('[クレーム') ? baseTitle : `${prefix}${baseTitle}`;
                                    onDispatchToProposal({
                                        title: titleWithPrefix,
                                        problem: formData.phenomenon || '',
                                        proposal: formData.countermeasure || '',
                                        category: formData.category || undefined,
                                        priority: lv >= 7 ? '高' : lv >= 4 ? '中' : '低',
                                        source_knowledge_id: item.id,
                                    });
                                }}
                                className="cursor-hint-pill"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    height: '28px', padding: '0 12px', boxSizing: 'border-box',
                                    background: 'rgba(99, 102, 241, 0.15)',
                                    border: '1px solid rgba(99, 102, 241, 0.5)',
                                    color: '#c7d2fe', fontSize: '0.82rem', fontWeight: 700,
                                    borderRadius: '10px', cursor: 'pointer', whiteSpace: 'nowrap',
                                }}
                                title="このナレッジを下書きとして提議画面を開きます"
                            >
                                <Send size={13} /> 提議に展開
                            </button>
                        )}
                    </div>
                )}

                {/* 区分 & 詳細 (ラベルは種別に連動) */}
                <div style={{ display: 'flex', gap: '14px', padding: '18px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label>{typeLabel}区分 <span style={{ color: 'red' }}>*</span></label>
                        <div style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--input-border)', borderRadius: '8px', background: 'var(--input-bg)' }}>
                            <GlassSelect
                                value={formData.category || ''}
                                options={[{ value: '', label: '選択してください' }, ...masters.categories.map(c => ({ value: c, label: c }))]}
                                onChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
                            />
                        </div>
                    </div>
                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label>{typeLabel}詳細 (選択追加) <span style={{ color: 'red' }}>*</span></label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--input-border)', borderRadius: '8px', background: 'var(--input-bg)' }}>
                                <GlassSelect
                                    value=""
                                    options={[
                                        { value: '', label: '選択してください' },
                                        ...masters.incidents
                                            .filter(i => !selectedIncidents.includes(i))
                                            .map(i => ({ value: i, label: i })),
                                    ]}
                                    onChange={(v) => {
                                        if (v && !selectedIncidents.includes(v)) {
                                            setSelectedIncidents([...selectedIncidents, v]);
                                        }
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {selectedIncidents.map(inc => (
                                    <div key={inc} style={{ background: 'var(--border)', color: 'var(--text)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        {inc} <X size={12} cursor="pointer" onClick={() => removeIncident(inc)} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <div
                            className={`status-toggle-btn solved ${formData.status === 'solved' ? 'active' : ''}`}
                            onClick={() => { statusTouchedRef.current = true; setFormData(p => ({ ...p, status: 'solved' })); }}
                            title="解決済みにする"
                        >
                            <Check size={24} strokeWidth={3} />
                        </div>
                        <div
                            className={`status-toggle-btn unsolved ${formData.status === 'unsolved' ? 'active' : ''}`}
                            onClick={() => { statusTouchedRef.current = true; setFormData(p => ({ ...p, status: 'unsolved' })); }}
                            title="未解決に戻す"
                        >
                            <RotateCcw size={22} strokeWidth={2.5} />
                        </div>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>タイトル (任意)</label>
                        <input
                            id="title"
                            type="text"
                            value={formData.title || ''}
                            onChange={handleChange}
                            placeholder="空欄の場合、インシデント名がタイトルになります"
                            style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }}
                        />
                    </div>
                </div>

                {/* 2. Unit info */}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label>号機 <span style={{ color: 'red' }}>*</span> {fetchingProperty && <span style={{ fontSize: '0.7rem', color: 'var(--primary)' }}>取得中...</span>}</label>
                        <input id="machine" type="text" value={formData.machine || ''} onChange={handleChange} onBlur={handleMachineBlur} placeholder="例: E1" style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>物件名 <span style={{ color: 'red' }}>*</span></label>
                        <input id="property" type="text" value={formData.property || ''} onChange={handleChange} style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label>依頼番号(11桁) {formData.category?.toLowerCase() !== 'construction' && <span style={{ color: 'red' }}>*</span>}</label>
                        <input id="req_num" type="text" value={formData.req_num || ''} onChange={(e) => setFormData(p => ({ ...p, req_num: e.target.value }))} maxLength={11} style={{ width: '100%', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)' }} />
                    </div>
                </div>

                <div>
                    <label>タグ (#区切り)</label>
                    <TagInput
                        value={tagInput}
                        onChange={setTagInput}
                        existingTags={existingTags}
                        placeholder="#js #error"
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                        <label>
                            事象 <span style={{ color: 'red' }}>*</span>
                            <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 400, color: 'var(--muted)', lineHeight: 1.5 }}>
                                いつ / 誰が / 何を / なぜ（原因・推定・経緯）まで含める
                            </span>
                        </label>
                        <textarea id="phenomenon" value={formData.phenomenon || ''} onChange={handleChange} placeholder="例）9/25 14:20 管理員より「1番機の全扉が開かない」と連絡。現地にて F7 ヒューズ切れを確認。列基板に焦げがあり、過電流によるものと推定。" style={{ width: '100%', height: '150px', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', resize: 'vertical', lineHeight: 1.5 }}></textarea>
                    </div>
                    <div>
                        <label>
                            対処 <span style={{ color: 'red' }}>*</span>
                            <span style={{ marginLeft: '8px', fontSize: '0.75rem', fontWeight: 400, color: 'var(--muted)', lineHeight: 1.5 }}>
                                どのように対処し、どうなったか（未完了なら次の予定・待ち事項）
                            </span>
                        </label>
                        <textarea id="countermeasure" value={formData.countermeasure || ''} onChange={handleChange} placeholder="例）ヒューズと列基板を交換し、全扉の開閉動作を確認して復旧。基板は在庫品を使用、予備品の補充を手配済み。" style={{ width: '100%', height: '150px', padding: '8px', border: '1px solid var(--input-border)', borderRadius: '4px', background: 'var(--input-bg)', color: 'var(--text)', resize: 'vertical', lineHeight: 1.5 }}></textarea>
                    </div>
                </div>

                {/* Attachments */}
                <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Paperclip size={14} /> 添付ファイル (OneDrive)
                        {/* Auth status badge */}
                        {isAuthenticated ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', color: '#22c55e', marginLeft: '4px' }}>
                                <ShieldCheck size={13} /> 認証済み
                            </span>
                        ) : (
                            <button
                                type="button"
                                onClick={authenticate}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '3px',
                                    fontSize: '0.75rem', color: '#f59e0b', background: 'none',
                                    border: '1px solid #f59e0b', borderRadius: '4px',
                                    padding: '2px 7px', cursor: 'pointer', marginLeft: '4px',
                                }}
                            >
                                <ShieldAlert size={13} /> Microsoft認証
                            </button>
                        )}
                    </label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        style={{ display: 'none' }}
                    />
                    {attachments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                            {attachments.map(att => (
                                <div key={att.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    padding: '6px 10px', background: 'var(--bg)',
                                    border: '1px solid var(--border)', borderRadius: '6px',
                                    fontSize: '0.85rem',
                                }}>
                                    {att.type.startsWith('image/') ? <Image size={14} color="var(--primary)" /> : <FileText size={14} color="#64748b" />}
                                    <a href={att.url} target="_blank" rel="noopener noreferrer"
                                        style={{ flex: 1, color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {att.name}
                                    </a>
                                    <ExternalLink size={12} color="#94a3b8" />
                                    {canEdit && (
                                        <X size={14} style={{ cursor: 'pointer', color: '#94a3b8', flexShrink: 0 }}
                                            onClick={() => removeAttachment(att.id)} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {canEdit && (
                        <button type="button"
                            onClick={() => {
                                if (!isAuthenticated) {
                                    authenticate().then(ok => { if (ok) fileInputRef.current?.click(); });
                                } else {
                                    fileInputRef.current?.click();
                                }
                            }}
                            disabled={uploading}
                            className="secondary-btn"
                            style={{ fontSize: '0.85rem', gap: '6px', display: 'flex', alignItems: 'center', width: 'fit-content' }}
                        >
                            <Paperclip size={14} />
                            {uploading ? statusMessage || 'アップロード中...' : 'ファイルを追加'}
                        </button>
                    )}
                    {canEdit && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '6px' }}>
                            <Sparkles size={12} style={{ flexShrink: 0 }} />
                            FC 報告画面などのスクショを Ctrl+V / ドラッグ&ドロップで貼ると、AI が読み取って空欄を自動入力します
                        </div>
                    )}
                </div>

                {item && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'right', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                        <span>
                            投稿者: <strong>{item.author}</strong> &nbsp;
                            {item.createdAt
                                ? <span className="num">{new Date(item.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                : ''}
                        </span>
                        <span>
                            最終更新: <strong>{item.updatedBy ?? history[0]?.changedBy ?? item.author}</strong> &nbsp;
                            <span className="num">{new Date(item.updatedAt).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </span>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                    {canEdit && (
                        <button type="submit" disabled={loading || checking} className="primary-btn" style={{ flex: 1, padding: '12px' }}>
                            {checking ? '記入内容を判定中…' : loading ? 'Processing...' : '保存'}
                        </button>
                    )}
                    {canEdit && item && (
                        <button type="button" onClick={handleDelete} disabled={loading || checking} className="danger-btn" style={{ flex: 1, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                            <Trash2 size={16} /> 削除
                        </button>
                    )}
                </div>
            </form>

            {/* 5W1H 不足ダイアログ。ここで起票を止める。6 観点すべての充足状況を出して「あと何が足りないか」を一目で分かるようにする */}
            <GlassModal
                open={!!qualityIssues}
                title="5W1H が不足しています"
                icon={<AlertTriangle size={18} style={{ color: 'var(--warning)' }} />}
                onClose={() => setQualityIssues(null)}
                maxWidth={640}
                footer={
                    <>
                        <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => {
                                const first = qualityIssues?.[0]?.aspect;
                                setQualityIssues(null);
                                if (first) setTimeout(() => focusAspectField(first), 0);
                            }}
                            style={{
                                height: 36, padding: '0 16px', boxSizing: 'border-box',
                                display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1,
                                fontSize: '0.85rem',
                            }}
                        >
                            <RotateCcw size={14} /> 入力に戻る
                        </button>
                        {isManagerOrAbove(user.role) && (
                            <button
                                type="button"
                                onClick={() => { setQualityIssues(null); void submitKnowledge(true); }}
                                title="不足を承知のうえ登録します（管理者のみ）"
                                style={{
                                    height: 36, padding: '0 16px', boxSizing: 'border-box',
                                    display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1,
                                    borderRadius: 10, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700,
                                    background: 'transparent', color: 'var(--text)',
                                    border: '1px solid var(--warning-border)',
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--warning-soft)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <ShieldAlert size={14} style={{ color: 'var(--warning)' }} /> 不足を承知で登録
                            </button>
                        )}
                    </>
                }
            >
                <div style={{ fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--text)', marginBottom: 14 }}>
                    後から読んだ人が同じ対応を再現できるよう、<strong>いつ / どこで / 誰が / 何を / なぜ / どのように</strong> が
                    本文から読み取れることを起票の条件にしています。
                    {qualityIssues?.some(i => i.source === 'ai')
                        ? '（AI が記入内容を読んで判定しました）'
                        : '（形式チェックで検出しました）'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ASPECT_ORDER.map(aspect => {
                        const issue = qualityIssues?.find(i => i.aspect === aspect);
                        const meta = ASPECT_META[aspect];
                        const ng = !!issue;
                        return (
                            <div
                                key={aspect}
                                onClick={ng ? () => { setQualityIssues(null); setTimeout(() => focusAspectField(aspect), 0); } : undefined}
                                title={ng ? 'クリックで該当の入力欄に移動' : undefined}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '18px 100px minmax(0, 1fr)',
                                    columnGap: 10, rowGap: 4, alignItems: 'center',
                                    padding: '10px 12px', borderRadius: 10, lineHeight: 1.5,
                                    cursor: ng ? 'pointer' : 'default',
                                    background: ng ? 'var(--danger-soft)' : 'var(--success-soft)',
                                    border: `1px solid ${ng ? 'var(--danger-border)' : 'var(--success-border)'}`,
                                }}
                            >
                                {ng
                                    ? <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />
                                    : <Check size={16} style={{ color: 'var(--success)' }} />}
                                {/* 不足 / 充足の区別は背景・枠・アイコンで付ける。
                                    文字を赤や緑にすると淡色テーマでコントラストが 4.5:1 を割るため常に --text */}
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>
                                    {meta.w}
                                </span>
                                <span style={{ fontSize: '0.85rem', minWidth: 0, overflowWrap: 'anywhere', color: 'var(--text)' }}>
                                    {ng ? issue!.reason : `${meta.label} は記載あり`}
                                </span>
                                {ng && (
                                    <span style={{ gridColumn: 3, fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--text)', overflowWrap: 'anywhere' }}>
                                        {meta.hint}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </GlassModal>
        </div>
    );
};

const DiffView: React.FC<{ oldText: string, newText: string }> = ({ oldText, newText }) => {
    // Basic line-based diff
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    
    // In a real app we'd use a more sophisticated longest common subsequence algorithm
    // but for simple knowledge updates, we can show side-by-side or stacked highlights.
    // Let's do a simple stacked comparison for visibility.
    
    return (
        <div style={{
            fontSize: '0.8rem', padding: '10px',
            background: 'rgba(0,0,0,0.02)', borderRadius: '8px', border: '1px solid var(--border)'
        }}>
            {oldText !== newText ? (
                <>
                    <div style={{ color: '#ef4444', textDecoration: 'line-through', opacity: 0.7, marginBottom: '4px' }}>
                        - {oldLines.slice(0, 3).join(' ')}{oldLines.length > 3 ? '...' : ''}
                    </div>
                    <div style={{ color: '#10b981', fontWeight: 700 }}>
                        + {newLines.slice(0, 3).join(' ')}{newLines.length > 3 ? '...' : ''}
                    </div>
                    {newLines.length > 3 && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '4px' }}>
                            (他 {newLines.length - 3} 行の変更あり)
                        </div>
                    )}
                </>
            ) : (
                <div style={{ color: 'var(--muted)' }}>内容の変更はありません（ステータスのみ等）</div>
            )}
        </div>
    );
};
