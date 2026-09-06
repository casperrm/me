# الجزء الخامس: معمارية قاعدة البيانات والـ Knowledge Graph

هالجزء بيحدد كيف كل البيانات بالنظام مترابطة ببعضها بشكل يخلي الإنسان والذكاء الاصطناعي يقدروا يفهموا ويستعلموا عن أي معلومة بنفس السهولة. القاعدة: **قاعدة بيانات علائقية (relational) بجوهرها، بس مصممة ومفهرسة كـ Knowledge Graph** — يعني العلاقات بين الكيانات مو تفصيل ثانوي، هي جزء أساسي من التصميم.

## المبدأ العام: كل شي Node، كل علاقة Edge

نتعامل مع كل جدول رئيسي كـ **Node type**، وكل foreign key أو جدول ربط كـ **Edge**. هيك حتى لو التخزين الفعلي Postgres علائقي تقليدي، طبقة الاستعلام (query layer) اللي الـ AI Agents بتستخدمها (الجزء الرابع) بتقدر "تمشي" بالعلاقات متل graph حقيقي: من عميل → لمشاريعه → لحملاته → لأصوله الإبداعية → لأدائها → لفاتورتها، بدون ما تحتاج تعرف بنية الجداول تحتياً.

## استراتيجية الـ IDs

كل entity بالنظام إله **ID فريد عالمياً مع بادئة تدل على نوعه (prefixed ULID)**، بدل auto-increment integer عادي. الأسباب:
- الـ AI Agents بتقدر تعرف نوع الكيان من شكل الـ ID مباشرة (`camp_01HXYZ...` = Campaign).
- ULID مرتّب زمنياً (sortable) بعكس UUID العشوائي، وهاد مفيد للأداء والفهرسة.
- ما في تعارض IDs بين موديولات مختلفة، حتى لو النظام توسّع لـ microservices لاحقاً.

**أمثلة البادئات:**

| البادئة | الكيان |
|---|---|
| `org_` | Organization |
| `usr_` | User |
| `cli_` | Client |
| `proj_` | Project |
| `camp_` | Campaign |
| `task_` | Task |
| `dlv_` | Deliverable |
| `ast_` | StudioAsset |
| `brd_` | BrandGuideline |
| `inv_` | Invoice |
| `ctr_` | Contract |
| `kb_` | KnowledgeArticle |
| `agt_` | AgentRun (تنفيذ محدد لوكيل) |
| `evt_` | Event |

## الكيانات الأساسية والعلاقات

```
Organization (org_)
   │
   ├── User (usr_) ──── Role/Permission (الجزء السابع)
   │
   └── Client (cli_)
          │
          ├── ClientContact
          ├── Contract (ctr_) ── SignatureRequest
          ├── Project (proj_)
          │      ├── Task (task_)
          │      ├── Milestone
          │      └── Deliverable (dlv_) ──── StudioAsset (ast_)
          │
          ├── Campaign (camp_)
          │      ├── CampaignChannel
          │      ├── CampaignBrief
          │      └── PerformanceSnapshot
          │
          ├── BrandGuideline (brd_)
          │
          ├── Invoice (inv_) ── Budget ── Expense ── TimeEntry
          │
          └── KnowledgeArticle (kb_) ─┐  (ذات صلة، رابط N:N)
                                       ▼
                              أي Node بالنظام
```

**علاقات مفصلية لازم تُفرض على مستوى الـ schema (مو بس على مستوى منطق التطبيق):**
- `Project.client_id` و `Campaign.client_id` — إلزامي، ما في مشروع أو حملة بدون عميل.
- `StudioAsset.brand_guideline_id` — إلزامي لما الأصل مرتبط بعميل إله Brand Guideline (يفرض الالتزام بالبراند من مستوى قاعدة البيانات، مو بس ثقة بالـ AI Agent).
- `ApprovalRequest.requested_by_agent_id` + `approved_by_user_id` — يوثّق دايماً مين اقترح (AI) ومين وافق (إنسان)، تفعيل مباشر لمبدأ Human-in-the-Loop على مستوى البيانات.
- `Invoice.contract_id` — الفاتورة لازم تكون مرتبطة بعقد فعّال أو استثناء موثّق صراحة.

## طبقة الأحداث (Event Log)

جدول `Event` (`evt_`) هو سجل append-only لكل حدث مهم صار بالنظام: `deliverable.approved`, `invoice.sent`, `campaign.launched`, `agent.recommendation_created`... هاد الجدول هو:
- المصدر اللي الموديولات بتتواصل من خلاله (event-driven communication — الجزء الثاني والرابع).
- الأساس لأي `Automation Workflow` (موديول الأتمتة).
- الـ audit trail الكامل — كل قرار بشري أو AI قابل للتتبع رجوعاً بالزمن.

## Knowledge Graph: الطبقة الدلالية فوق البيانات البنيوية

بالإضافة للعلاقات العلائقية التقليدية، عنا طبقة تانية:

- **`KnowledgeEmbedding`** — تمثيل vector لكل `KnowledgeArticle`, `Learning`, و`CampaignBrief` مهم، يُستخدم للبحث الدلالي (semantic search) من قبل الـ AI Agents.
- **`EntityLink`** — جدول ربط عام (polymorphic) بيسمح بربط أي كيانين ببعض بعلاقة موصوفة (مثلاً: "هاد الـ Learning مرتبط بهاد الـ Campaign لأنه نتج عنها"). هيك الـ Knowledge Graph بيقدر يكبر عضوياً بدون ما نحتاج جدول ربط جديد لكل نوع علاقة.

هاي الطبقة هي اللي بتخلي Research Agent وProduct Manager Agent (الجزء الرابع) يقدروا يسألوا أسئلة متل: "شو الحملات المشابهة لهاي اللي نجحت بالسابق، وليش؟" ويلاقوا جواب مبني على بيانات حقيقية مترابطة، مو بس نص حر.

## الفهرسة (Indexing Strategy)

- **كل foreign key مفهرس افتراضياً** — أي استعلام "جيب كل مشاريع هاد العميل" لازم يكون O(log n) دايماً.
- **فهارس مركّبة (composite indexes)** على الأنماط الشائعة: `(client_id, status)`, `(project_id, created_at)` — مبنية على أنماط استعلام لوحة التحكم (الجزء السادس).
- **فهرسة vector منفصلة** (pgvector أو مكافئ) لجدول `KnowledgeEmbedding` — معزولة عن الفهرسة العلائقية العادية لأن طبيعة الاستعلام مختلفة (تشابه، مو تطابق).
- **Full-text search** على الحقول النصية الكبيرة (أوصاف مشاريع، محتوى مقالات المعرفة) بشكل منفصل عن البحث الدلالي — بحث حرفي سريع لما المستخدم يعرف بالضبط شو يدوّر عليه.

## الملفات والأصول (Files & Assets)

الملفات (تصاميم، فيديوهات، مستندات عقود) **ما بتتخزن بقاعدة البيانات نفسها** — بتتخزن بـ object storage (S3 أو مكافئ)، وقاعدة البيانات بتحتفظ بالـ metadata بس:

- `StudioAsset` / `ContractDocument` بيحتوي: `storage_key`, `mime_type`, `size`, `checksum`, `version`.
- كل نسخة تعديل = سجل جديد مرتبط بـ `previous_version_id` — تاريخ كامل قابل للرجوع، ما في "استبدال" يمحي نسخة قديمة.
- `checksum` إلزامي على كل ملف — يضمن سلامة الملف ويمنع تكرار تخزين نفس الأصل مرتين (deduplication).

## تعدد المستأجرين (Multi-Tenancy)

كل جدول بالنظام (ما عدا جداول النظام العامة) بيحمل `org_id` إلزامي، وكل استعلام بيمر بفلترة تلقائية على مستوى طبقة الوصول للبيانات (data access layer) — مو مسؤولية كل موديول يتذكر يفلتر بنفسه. هيك بنضمن إن بيانات وكالة (`Organization`) ما بتتسرب أبداً لوكالة تانية، حتى لو صار خطأ برمجي بموديول معيّن.

## القاعدة الذهبية

أي جدول جديد بالمستقبل لازم يجاوب: (1) شو الـ `org_id` وعلاقته بالـ tenant، (2) شو علاقته بـ `Client` أو `Project` كنقطتي الربط المركزيتين، (3) هل يحتاج فهرسة دلالية (embedding) عشان الـ AI يقدر "يفهمه" مو بس "يقرأه".
