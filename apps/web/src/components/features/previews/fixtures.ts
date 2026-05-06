/**
 * Hardcoded demo data for the marketing feature section. None of this
 * is fetched at runtime — every preview component reads directly from
 * the constants below so the marketing page stays backend-free.
 *
 * The data is curated for emphasis, not realism: a single demo video
 * carries Summary / Article / Transcript / Notes content in four
 * languages, and the inbox row list is hand-tuned so each filter pill
 * yields a non-empty subset.
 */

export type LanguageCode = 'en' | 'zh-Hans' | 'ja' | 'es';

export const DEMO_LANGUAGES: { code: LanguageCode; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'zh-Hans', nativeName: '简体中文' },
  { code: 'ja', nativeName: '日本語' },
  { code: 'es', nativeName: 'Español' },
];

export const DEMO_VIDEO = {
  id: 'demo-octopus',
  title: 'The alien intelligence of octopuses',
  channelName: 'Quanta',
  channelInitial: 'Q',
  durationLabel: '21 min',
  publishedLabel: '3d ago',
};

export interface InboxRow {
  id: string;
  title: string;
  channelName: string;
  channelInitial: string;
  channelTint: string;
  durationLabel: string;
  publishedLabel: string;
  isUnread: boolean;
  isStarred: boolean;
  isSaved: boolean;
  isArchived: boolean;
  hasSummary: boolean;
  hasArticle: boolean;
  hasTranscript: boolean;
  noteCount: number;
}

export const INBOX_ROWS: InboxRow[] = [
  {
    id: 'r1',
    title: 'The alien intelligence of octopuses',
    channelName: 'Quanta',
    channelInitial: 'Q',
    channelTint: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    durationLabel: '21 min',
    publishedLabel: '3d ago',
    isUnread: true,
    isStarred: true,
    isSaved: false,
    isArchived: false,
    hasSummary: true,
    hasArticle: true,
    hasTranscript: true,
    noteCount: 2,
  },
  {
    id: 'r2',
    title: 'How memory rewrites itself every time you remember',
    channelName: 'Veritasium',
    channelInitial: 'V',
    channelTint: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    durationLabel: '18 min',
    publishedLabel: '6h ago',
    isUnread: true,
    isStarred: false,
    isSaved: true,
    isArchived: false,
    hasSummary: true,
    hasArticle: true,
    hasTranscript: true,
    noteCount: 0,
  },
  {
    id: 'r3',
    title: 'Designing a morning block that survives interruption',
    channelName: 'Andrew Huberman',
    channelInitial: 'A',
    channelTint: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    durationLabel: '32 min',
    publishedLabel: '1d ago',
    isUnread: false,
    isStarred: true,
    isSaved: false,
    isArchived: false,
    hasSummary: true,
    hasArticle: false,
    hasTranscript: true,
    noteCount: 1,
  },
  {
    id: 'r4',
    title: 'Why your second draft is almost always your best',
    channelName: 'Tim Urban',
    channelInitial: 'T',
    channelTint: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    durationLabel: '14 min',
    publishedLabel: '2d ago',
    isUnread: true,
    isStarred: false,
    isSaved: false,
    isArchived: false,
    hasSummary: true,
    hasArticle: true,
    hasTranscript: true,
    noteCount: 0,
  },
  {
    id: 'r5',
    title: 'The compound interest of deep work',
    channelName: 'Cal Newport',
    channelInitial: 'C',
    channelTint: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    durationLabel: '24 min',
    publishedLabel: '4d ago',
    isUnread: false,
    isStarred: false,
    isSaved: true,
    isArchived: false,
    hasSummary: true,
    hasArticle: true,
    hasTranscript: true,
    noteCount: 3,
  },
  {
    id: 'r6',
    title: 'A talk I revisited a year later',
    channelName: 'Rich Roll',
    channelInitial: 'R',
    channelTint: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    durationLabel: '46 min',
    publishedLabel: '2w ago',
    isUnread: false,
    isStarred: false,
    isSaved: false,
    isArchived: true,
    hasSummary: true,
    hasArticle: true,
    hasTranscript: true,
    noteCount: 4,
  },
];

export interface DemoSummary {
  headline: string;
  short: string;
  full: string;
}

export const DEMO_SUMMARY: Record<LanguageCode, DemoSummary> = {
  en: {
    headline: 'Octopus cognition is the closest thing we have to studying alien intelligence.',
    short:
      'Two-thirds of an octopus’s neurons live in its arms, not its brain. It evolved problem-solving along a lineage so distant from ours that what it shows about “intelligence” may not generalize from primates at all.',
    full: 'Octopuses split from our evolutionary line over 600 million years ago. They open jars, recognize individual humans, and dream — and they do it with a nervous system that delegates rather than commands. Each arm has its own neural cluster; the central brain supervises from a distance. Studying octopus cognition is less like comparing notes with another mammal and more like meeting a second draft of intelligence written from scratch.',
  },
  'zh-Hans': {
    headline: '章鱼的认知是我们最接近研究"外星智能"的窗口。',
    short:
      '章鱼三分之二的神经元分布在腕足里，而不在大脑。它们沿着一条与我们极其遥远的进化路径发展出解决问题的能力，因此它们所揭示的"智能"也许根本无法从灵长类那里推广过来。',
    full: '章鱼与我们的进化线在六亿多年前就已分道扬镳。它们能拧开瓶盖、能辨认人脸、可能也会做梦——而完成这一切的神经系统是分布式的，而不是集中式的。每条腕足都有自己的神经丛，中枢大脑只负责远距离协调。研究章鱼的认知更像是在阅读智能的另一份草稿，从头到尾用另一种逻辑重写。',
  },
  ja: {
    headline: 'タコの認知は、私たちが「異星人の知性」に最も近づける研究対象だ。',
    short:
      'タコの神経細胞の三分の二は脳ではなく腕にある。私たちの系統と遠く離れた進化の道のりで問題解決能力を獲得したため、霊長類由来の「知性」観をそのまま当てはめるのは難しい。',
    full: 'タコは六億年以上前に私たちの進化系統から分かれた。瓶の蓋を開け、人間の顔を見分け、夢を見るかもしれない——それを命令型ではなく委任型の神経系で行っている。各腕に独立した神経クラスタがあり、中枢の脳は遠くから監督するだけだ。タコの認知を研究することは、別の哺乳類と比較するというより、ゼロから書き直された二稿目の知性に出会うことに近い。',
  },
  es: {
    headline:
      'La cognición del pulpo es lo más cercano que tenemos a estudiar una inteligencia alienígena.',
    short:
      'Dos tercios de las neuronas de un pulpo viven en sus brazos, no en su cerebro. Desarrolló la capacidad de resolver problemas por una rama evolutiva tan distante de la nuestra que lo que nos enseña sobre la "inteligencia" quizá no se traduzca desde los primates.',
    full: 'Los pulpos se separaron de nuestra línea evolutiva hace más de 600 millones de años. Abren frascos, reconocen a personas concretas y posiblemente sueñan — y lo hacen con un sistema nervioso que delega en lugar de mandar. Cada brazo tiene su propio núcleo neuronal; el cerebro central supervisa a distancia. Estudiar la cognición del pulpo es menos como comparar notas con otro mamífero y más como encontrarse con un segundo borrador de la inteligencia, escrito desde cero.',
  },
};

export const DEMO_ARTICLE: Record<LanguageCode, string> = {
  en: `## A nervous system that delegates

We picture intelligence as something a brain does. The octopus quietly disagrees. Two-thirds of its half-billion neurons live in its arms, each one a small problem-solver answering mostly to itself. The central brain supervises from a distance the way a director supervises a crew — setting intention, not micromanaging fingers.

This is a different operating model. When an octopus reaches into a crevice, the arm is doing the deciding: feeling, gripping, retreating, looping back if it bumps something interesting. The brain is consulted only when the situation needs a vote. Researchers have severed the major nerve trunk between brain and arm in surgical preparations and the arm continues to investigate, grip, and recoil from threats — local intelligence, running on its own clock.

It is hard to overstate how unfamiliar this is. Vertebrate cognition is centralized: a thalamus relays, a cortex deliberates, a motor system obeys. Octopus cognition looks more like a small, well-coordinated team than a CEO with hands.

## A draft of intelligence written somewhere else

Octopuses split from our line of descent over 600 million years ago, somewhere in the dim Cambrian. Whatever cognitive trick they have, they invented on their own — independently of vertebrates, without any of our shared scaffolding. They open jars. They recognize individual humans, even when those humans are wearing identical lab coats. They escape sealed tanks at night and appear, dripping, in the next aquarium over.

In captivity, octopuses learn quickly. They figure out how a latch works after watching it once. They favor certain caretakers and squirt cold water at the ones they dislike. They have been observed stockpiling rocks and shells outside their dens — collections, of a kind. Whether these behaviors qualify as "play" depends on definitions we wrote with primates in mind, but the behaviors themselves are unambiguous: deliberate, repeated, and not obviously goal-directed.

If our notion of "intelligence" is shaped entirely by primate examples, the octopus is the species that quietly tells us how much of that notion is local.

## Skin that thinks

The strangest detail may not be the brain at all. It is the skin. An octopus changes color and texture in milliseconds, faster than its visual system can plausibly drive — and it does this even when the lighting is wrong, even when its eyes are damaged, even, possibly, when the animal is colorblind, which most octopuses are.

Photoreceptors live in the skin itself. The body is, in a real sense, seeing. What is being computed there, and where the answer is being read, no one has fully worked out. The skin is doing something that in a vertebrate would require a visual cortex.

- The past gets rewritten by every act of remembering.
- Confident memories are often the most revised.
- Details erode faster than emotional tone.
- And in the octopus, even "where memory lives" is unsettled.

## Memory in a creature that does not share it

Octopuses live three to five years. They do not raise their young. The mother lays a single clutch, guards it without eating until it hatches, and dies. The young drift, learn, and die in their own season, taking everything they figured out with them. There is no culture, no schooling, no parental download. Each generation rebuilds intelligence from the ground up.

That is part of what makes their cognitive feats so striking. Whatever an octopus knows, it taught itself, in less time than a graduate degree, using a body whose nervous system was distributed across nine semi-autonomous nodes.

## A reminder, not an answer

The point isn't that the octopus is smarter than us, or smarter in the same way we are. The point is that intelligence has more than one form, and that the form we know best — centralized, language-shaped, socially transmitted, slow-cooked across childhood — is not the only one a planet has produced.

For anyone interested in what general intelligence might look like in systems unlike ourselves, the octopus is a closer-to-home rehearsal than any thought experiment. It is sitting in tide pools right now, opening jars, watching us back.`,
  'zh-Hans': `## 一种"分布式"的神经系统

我们习惯把智能想象成"大脑做出来的事"。章鱼则不动声色地提出异议。它五亿个神经元里有三分之二并不在脑里，而是分布在腕足上。每一条腕都是一个小型的、几乎独立的解决问题者，中枢大脑只像导演那样远远地监督——给出意图，而不是去微管每一根手指。

这是一种完全不同的运作模式。当一只章鱼伸进缝隙时，决定怎么做的其实是那条腕：触摸、抓握、撤回，遇到有意思的东西就再回头去看看。只有需要"投票"的时候，大脑才会被请进来。研究者甚至切断过腕与脑之间的主神经干，被分离的腕仍然会探查、抓握、躲避——本地智能，跑在自己的节拍上。

很难夸大这有多陌生。脊椎动物的认知是中央集权式的：丘脑转发、皮层决策、运动系统执行。章鱼的认知更像是一支配合默契的小团队，而不是一个有手的 CEO。

## 在另一处重写过的智能草稿

章鱼和我们的进化线在六亿多年前就已分开，遥远到寒武纪深处。它身上的任何认知技巧都是它独立发明的——没有借用脊椎动物的脚手架。它会拧开瓶盖、会辨认人脸，哪怕实验员都穿着同款白大褂。它会在夜里逃出密封的水缸，第二天滴着水，出现在隔壁的鱼缸里。

在水族馆里，章鱼学得很快。看一次锁扣怎么开就能记住，会偏爱某些饲养员，对不喜欢的人喷冷水。人们也观察到它们在洞穴外堆放石头和贝壳——某种意义上的"收藏"。这些行为算不算"玩耍"，取决于一套用灵长类写出来的定义；但行为本身没什么歧义：刻意的、重复的、并不明显地以目标为导向。

如果我们对"智能"的认识完全由灵长类的例子塑造，那么章鱼就是那个静静告诉我们：这种认识里有多少其实只属于本地。

## 会"思考"的皮肤

也许最奇怪的细节根本不在脑里，而在皮肤上。章鱼能在毫秒之内改变颜色和纹理，速度比它的视觉系统可能驱动的还要快——并且，在光线不对的时候、在眼睛受损的时候、甚至在它本身就是色盲的情况下，它也照样能完成这件事，而绝大多数章鱼是色盲的。

光感受器就长在皮肤里。从某种程度上说，整个身体都在"看"。皮肤里到底在计算什么、最终被谁读取，目前还没有完全弄清楚。它在做的事，如果发生在脊椎动物身上，需要一整块视觉皮层才能完成。

- 每一次回忆都会重写过去。
- 越自信的记忆，往往被改写得越多。
- 细节比情绪色彩消失得更快。
- 而在章鱼身上，连"记忆住在哪"都还是悬而未决的问题。

## 一种不传递经验的生灵

章鱼只活三到五年。它们不抚养后代。母章鱼一辈子产一次卵，守着卵不进食直到孵化，然后死去。幼体随波漂流、自己学习、死于自己的季节——把它们摸索出来的一切，全部带走。没有文化、没有学校、没有亲代下载。每一代都得从零开始重建智能。

这正是它们的认知成就如此惊人的部分原因。章鱼所知道的一切都是自己摸出来的，而且时间不到一个研究生学位的长度，使用的是一具神经系统分布在九个半自治节点上的身体。

## 这是一种提醒，而非答案

重点不在于章鱼比我们更聪明，也不在于它和我们以同样的方式聪明。重点在于：智能不只有一种形态，而我们最熟悉的那种——集中式、由语言塑造、靠社会传递、在童年里慢慢炖出来——并不是地球生产出的唯一一种。

对任何关心"在与我们截然不同的系统里，通用智能可能长什么样"的人来说，章鱼是一种近在身边的彩排。此刻它就在潮间带里，拧瓶盖、回头看着我们。`,
  ja: `## 委任する神経系

私たちは知性を「脳がやっていること」だと考えがちだ。タコは静かに異議を唱える。五億ほどある神経細胞の三分の二は脳にではなく腕にあり、それぞれが自分自身に応答する小さな問題解決装置だ。中枢の脳は遠くから現場を監督する——意図を決めるが、指の動きまでは口を出さない。

これはまったく別の運用モデルだ。タコが岩の隙間に腕を伸ばすとき、決めているのは腕自身だ。触り、握り、引き返し、面白いものに当たればもう一度戻ってくる。脳に相談されるのは「評決」が必要なときだけだ。研究者が脳と腕をつなぐ主神経幹を切断した実験でも、切り離された腕は探索を続け、握り、危険から逃げる。ローカルな知性が、自分のテンポで動いている。

これがどれほど見慣れない構造かは、いくら強調してもしすぎることはない。脊椎動物の認知は中央集権的だ。視床が中継し、皮質が決断し、運動系が従う。タコの認知はむしろ、よく訓練された小さなチームに似ている。手のついた CEO ではなく、共同作業をする集団のかたちだ。

## どこか別の場所で書かれた知性の草稿

タコは六億年以上前にカンブリア紀のどこかで、私たちの系統から分かれた。タコの認知能力は脊椎動物の足場を借りずに、まったく独立に発明されたものだ。瓶の蓋を開ける。同じ白衣を着た複数の研究員のなかから、特定の人間を見分ける。夜のうちに密閉した水槽から脱走し、翌朝、隣の水槽に水滴を垂らしながら現れる。

飼育下のタコは学習が速い。掛け金の仕組みを一度見ただけで覚える。気に入った飼育員と、気に入らない飼育員に冷水を吹きかける。巣穴の外に石や貝を集めて並べていることも観察されている——一種の「コレクション」だ。これらが「遊び」かどうかは、霊長類を念頭に書かれた定義に依存するが、行動そのものは曖昧ではない。意図的で、繰り返し起きており、見るからに目的に向かっているわけでもない。

「知性」という私たちの感覚が霊長類の事例だけで形作られているのなら、タコはそれが実はかなりローカルなものだと静かに教えてくれる種だ。

## 「考える」皮膚

最も奇妙なディテールは、脳ではなく皮膚にあるかもしれない。タコはミリ秒単位で色と質感を変える。視覚系がそれを駆動できるよりも速く、しかも光が合っていないとき、目が傷んでいるとき、そして本人が色覚を持たないとき——ほとんどのタコは色覚がない——にもそれをやってのける。

光受容体は皮膚そのものにある。ある意味で、体全体が「見て」いる。皮膚で何が計算されていて、その答えがどこで読み取られているのかは、まだ完全には解明されていない。脊椎動物なら視覚野が必要な仕事を、皮膚がやっている。

- 思い出すたびに過去は書き換わる。
- 確信の強い記憶ほど、改訂回数が多い。
- 細部は感情の色合いより早く消えていく。
- そしてタコにおいては、「記憶がどこに住んでいるのか」さえ未解決だ。

## 経験を引き継がない生き物

タコの寿命は三〜五年。子育てをしない。母親は一度だけ卵を産み、孵化まで何も食べずに守り、そして死ぬ。子は漂い、独学し、自分の季節に死ぬ——掴んだものをすべて道連れに。文化はなく、学校もなく、親からのダウンロードもない。世代ごとに、知性をゼロから組み立て直す。

タコの認知的な離れ業が際立つ理由のひとつはここにある。タコが知っていることはすべて自分で身につけたもので、しかも大学院の年限よりも短いあいだに、九つの半自律的な節点に分散した神経系を持つ身体で、それを成し遂げている。

## 答えではなく、ひとつのリマインダー

タコが私たちより賢いとか、同じやり方で賢いという話ではない。知性には複数の形があり、私たちが最もよく知っている形——中央集権的で、言語に縁取られ、社会的に伝達され、子供時代をかけて煮込まれていくもの——は、この惑星が生み出した唯一の形ではない、ということだ。

私たちとは異なるシステムにおいて「汎用的な知性」がどんな姿をしているのかに関心がある人にとって、タコはどんな思考実験よりも近場の予行演習だ。今この瞬間も潮だまりに座って、瓶の蓋を開けながら、こちらを見返している。`,
  es: `## Un sistema nervioso que delega

Imaginamos la inteligencia como algo que hace un cerebro. El pulpo discrepa con discreción. Dos tercios de sus quinientos millones de neuronas no viven en el cerebro, sino en los brazos: cada uno un pequeño solucionador de problemas que se responde, en gran medida, a sí mismo. El cerebro central supervisa de lejos, como un director con su equipo: marca la intención, no microgestiona los dedos.

Es un modelo operativo distinto. Cuando un pulpo mete un brazo en una grieta, es el brazo el que decide: tocar, agarrar, retirarse y volver a entrar si encuentra algo interesante. Solo se consulta al cerebro cuando hace falta una votación. Hay experimentos donde se secciona el tronco nervioso entre cerebro y brazo y el brazo continúa explorando, agarrando y huyendo de amenazas. Inteligencia local, corriendo a su propio reloj.

Cuesta exagerar lo poco familiar que es esto. La cognición de los vertebrados está centralizada: el tálamo retransmite, la corteza delibera, el sistema motor obedece. La cognición del pulpo se parece más a un equipo pequeño y bien coordinado que a un CEO con manos.

## Un borrador de inteligencia escrito en otro lugar

Los pulpos se separaron de nuestra línea hace más de 600 millones de años, en algún punto del lejano Cámbrico. Cualquier truco cognitivo que tengan se lo inventaron por su cuenta, sin el andamiaje de los vertebrados. Abren frascos. Reconocen a personas concretas, incluso cuando esas personas llevan batas de laboratorio idénticas. Escapan de tanques sellados por la noche y aparecen, goteando, en el acuario de al lado.

En cautividad aprenden rápido. Entienden cómo funciona un pestillo viéndolo una vez. Prefieren a ciertos cuidadores y disparan agua fría a los que no les caen bien. Se les ha visto apilar piedras y conchas a la entrada de su madriguera — colecciones, en cierto sentido. Si esas conductas cuentan como "juego" depende de definiciones que escribimos pensando en primates, pero las conductas en sí son inequívocas: deliberadas, repetidas y no obviamente dirigidas a un objetivo.

Si nuestra idea de "inteligencia" está moldeada por ejemplos de primates, el pulpo es la especie que nos dice, sin levantar la voz, cuánto de esa idea es local.

## Una piel que piensa

El detalle más extraño quizá no esté en el cerebro. Está en la piel. Un pulpo cambia de color y de textura en milisegundos, más rápido de lo que su sistema visual puede plausiblemente impulsar — y lo hace incluso cuando la luz no es la adecuada, incluso con los ojos dañados, incluso, posiblemente, cuando es daltónico, como lo son la mayoría de los pulpos.

Hay fotorreceptores en la piel misma. El cuerpo, en un sentido real, está viendo. Qué se computa allí y dónde se lee la respuesta nadie lo ha resuelto del todo. La piel está haciendo algo que en un vertebrado requeriría una corteza visual.

- El pasado se reescribe en cada acto de recordar.
- Los recuerdos más seguros suelen ser los más revisados.
- Los detalles se erosionan antes que el tono emocional.
- Y en el pulpo, hasta "dónde vive la memoria" sigue sin estar claro.

## Memoria en una criatura que no la transmite

Los pulpos viven entre tres y cinco años. No crían a sus hijos. La madre pone una sola puesta, la guarda sin comer hasta que eclosiona y muere. Las crías van a la deriva, aprenden y mueren en su propia temporada, llevándose con ellas todo lo que aprendieron. No hay cultura, no hay escuela, no hay descarga parental. Cada generación reconstruye la inteligencia desde cero.

Eso es parte de lo que hace que sus logros cognitivos sean tan llamativos. Lo que un pulpo sabe se lo enseñó a sí mismo, en menos tiempo del que dura una tesis doctoral, usando un cuerpo cuyo sistema nervioso está repartido entre nueve nodos semi-autónomos.

## Un recordatorio, no una respuesta

El asunto no es que el pulpo sea más listo que nosotros, ni que lo sea de la misma manera. El asunto es que la inteligencia tiene más de una forma, y la forma que mejor conocemos — centralizada, moldeada por el lenguaje, transmitida socialmente, cocinada a fuego lento durante la infancia — no es la única que ha producido este planeta.

Para quien le interese cómo podría ser una inteligencia general en sistemas distintos a los nuestros, el pulpo es un ensayo más cercano que cualquier experimento mental. Está sentado en charcos de marea ahora mismo, abriendo frascos, devolviéndonos la mirada.`,
};

export interface TranscriptLine {
  time: string;
  text: string;
}

export const DEMO_TRANSCRIPT: TranscriptLine[] = [
  {
    time: '0:08',
    text: 'The first thing you notice about an octopus is that it is paying attention to you.',
  },
  { time: '0:21', text: 'Most invertebrates do not give you that. A clam will not look back.' },
  { time: '0:34', text: 'Two thirds of its neurons live in the arms — not the brain.' },
  { time: '0:46', text: 'Each arm has its own neural cluster, solving problems locally.' },
  { time: '1:02', text: 'The central brain delegates rather than commands.' },
  { time: '1:18', text: 'They open jars. They recognize individual humans.' },
  {
    time: '1:31',
    text: 'They dream, maybe — at least their skin twitches the way ours does in REM.',
  },
  { time: '1:47', text: 'And they live only a few years, taking what they learned with them.' },
];

export interface DemoNote {
  id: string;
  time: string;
  text: string;
}

export const DEMO_NOTES: DemoNote[] = [
  {
    id: 'n1',
    time: '0:34',
    text: 'Two-thirds of the neurons in the arms — would love to see what this looks like in a brain scan.',
  },
  {
    id: 'n2',
    time: '1:31',
    text: 'Come back: what does intelligence even mean if this lineage has it too?',
  },
];

export interface SearchResult {
  initial: string;
  tint: string;
  title: string;
  snippet: string;
  keywords: string;
}

export const SEARCH_RESULTS: SearchResult[] = [
  {
    initial: 'A',
    tint: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    title: 'Designing a morning block that survives',
    snippet: 'The first ninety minutes set the tone for everything that comes after...',
    keywords: 'morning focus deep work routine attention',
  },
  {
    initial: 'T',
    tint: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    title: 'What Slack does to your working memory',
    snippet: 'Every ping costs attention, even when you manage to ignore it...',
    keywords: 'slack notifications attention focus interruption',
  },
  {
    initial: 'C',
    tint: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    title: 'The compound interest of deep work',
    snippet: 'Small gains in focus stack across months into a genuine advantage...',
    keywords: 'deep work focus discipline compound habit',
  },
  {
    initial: 'Q',
    tint: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    title: 'The alien intelligence of octopuses',
    snippet: 'Two-thirds of the neurons live in the arms, not the brain...',
    keywords: 'octopus cognition brain animal intelligence',
  },
  {
    initial: 'V',
    tint: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    title: 'Memory rewrites itself every time you recall it',
    snippet: 'Reconsolidation is why confident memories are the most revised...',
    keywords: 'memory recall reconsolidation neuroscience',
  },
  {
    initial: 'I',
    tint: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    title: 'Why your second draft is almost always better',
    snippet: 'The first pass is for figuring out what you mean. The second is for saying it...',
    keywords: 'writing draft editing revision craft',
  },
];
