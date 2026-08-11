import { redirect } from 'next/navigation';
import { JetBrains_Mono, Geologica, Onest, Manrope } from 'next/font/google';
import { auth } from '@/lib/auth';
import { AnimatedPage } from '@/components/ui/animated-page';
import { ConceptPanel } from '@/components/admin/concept-panel';
import { ConceptGlass, ConceptNight, ConceptBento } from '@/components/admin/concepts-modern';
import { ConceptAurora, ConceptCrystal } from '@/components/admin/concepts-glass';

// Service page for choosing the app's visual identity. ADMIN-only, no nav link
// — same treatment as /admin/rating-debug. Changes nothing; it only previews.
//
// Every concept renders the same screen («Розподіл ставок») on the same sample
// rows, so what differs between them is only the design. They now sit in one
// family — modern product surfaces, glass and Stripe — after the print-era
// directions (Відомість / Кафедра / Пульт) were rejected and deleted.

// Loaded here rather than in the root layout, so these families ship on this one
// route. The winner's fonts move to app/layout.tsx; the rest are deleted with
// this page.
const jet = JetBrains_Mono({
  variable: '--dc-jet',
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500'],
});
// «Панель» — Geologica sets the figures, Onest the interface. Both are
// Cyrillic-first, so Ukrainian is the design case rather than an afterthought.
const geologica = Geologica({
  variable: '--dc-geologica',
  subsets: ['latin', 'cyrillic'],
  weight: ['500', '600'],
});
const onest = Onest({
  variable: '--dc-onest',
  subsets: ['latin', 'cyrillic'],
});
// The glass concepts — Manrope is the closest thing on Google Fonts to the tight
// geometric grotesque Apple sets its interfaces in, and it carries Cyrillic.
const manrope = Manrope({
  variable: '--dc-manrope',
  subsets: ['latin', 'cyrillic'],
});

const CONCEPTS = [
  {
    id: 'aurora',
    name: 'Аврора',
    type: 'Manrope',
    idea: 'Скло на градієнті Stripe. Три кольорові плями внизу, дрібне зерно поверх них — щоб градієнт не розбивався на смуги, — а вже на цьому матові панелі: розмиття, світла волосінь по верхньому краю і тінь, яка водночас щільна й широка. Скло працює лише тоді, коли видно, що за ним щось є. Кільце фонду з «Скла» і точність «Панелі» — в одній композиції.',
    cost: 'Помірна. Композиція та сама, що в «Панелі»; додаються градієнтне тло, зерно та матові поверхні.',
    Component: ConceptAurora,
  },
  {
    id: 'crystal',
    name: 'Кристал',
    type: 'Manrope',
    idea: 'Та сама будова, але над нічним небом. Темне скло складніше за світле: напівпрозора біла панель на темному тлі стає брудно-сірою, якщо світло за нею безбарвне. Тому плями внизу насиченіші, панель — біле лише під 6 %, а поверхню тримає переважно світлий відблиск по краю. Смуга фонду світиться.',
    cost: 'Помірна, плюс питання теми: це темний застосунок за замовчуванням.',
    Component: ConceptCrystal,
  },
  {
    id: 'panel',
    name: 'Панель',
    type: 'Geologica / Onest',
    idea: 'Сучасна продуктова панель у дусі Stripe і Linear. Відрізняє її не палітра, а обробка поверхонь: багатошарова тінь замість однієї плоскої рамки, волосяна лінія всередині кожної піднятої площини, сегментний перемикач років, чіп зміни біля кожного великого числа і спарклайн, який несе динаміку замість самого числа. Акцент — той самий синій #4472C4, що вже стоїть у ваших звітах Word, тож екран, друк і PDF нарешті виглядають однією системою.',
    cost: 'Найдешевше з усіх: композиція сумісна з shadcn. Нові — тінь, чіпи, спарклайн, сегментний перемикач і акцентний колір.',
    Component: ConceptPanel,
  },
  {
    id: 'glass',
    name: 'Скло',
    type: 'Manrope',
    idea: 'Apple. Там речі розділяють матеріалом і повітрям, а не лініями: панель — це біле під 72 % із розмиттям позаду, кути великі, а замість рамки — світлий відблиск усередині. Фонд став кільцем, бо саме так ця школа показує величину відносно цілі: синя дуга — роздане, бліда помаранчева — те, на скільки формула вилазить за фонд. Список — згрупований, як у налаштуваннях iOS.',
    cost: 'Середнє. Прозорість і розмиття треба перевірити на слабких ноутбуках; кільце й згрупований список — нові компоненти.',
    Component: ConceptGlass,
  },
  {
    id: 'night',
    name: 'Ніч',
    type: 'Onest / JetBrains Mono',
    idea: 'Linear і Vercel. Оболонку прибрано майже до нуля, щоб контраст лишився тільки в даних: рамки — білий під 7 %, панелі ледь піднімаються над тлом, а підсумкову картку обводить градієнтна волосінь, що згасає по колу. Щільно — 13px і вузькі рядки. Керування з клавіатури: поле ⌘K і чіпи-фільтри замість панелі кнопок.',
    cost: 'Середнє. Темна тема стає основною; світлу доведеться або лишити як другу, або прибрати.',
    Component: ConceptNight,
  },
  {
    id: 'bento',
    name: 'Бенто',
    type: 'Manrope',
    idea: 'Сітка Apple: плитки навмисно різного розміру, тож сама верстка каже, що головніше. Найбільша плитка — справжній графік, а не число. Ця форма пасує радше «Огляду», ніж кафедральній таблиці, — це форма підсумку, а не форми для заповнення, — але показана на тих самих даних, щоб було з чим порівняти.',
    cost: 'Найбільше підходить для /dashboard, не для робочих екранів. Плитки — нова сітка, решта збігається з «Панеллю».',
    Component: ConceptBento,
  },
];

export default async function DesignPreviewPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  return (
    <AnimatedPage
      className={`space-y-10 ${jet.variable} ${geologica.variable} ${onest.variable} ${manrope.variable}`}
    >
      <div>
        <h1 className="text-2xl font-semibold">Обличчя застосунку</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Один екран — «Розподіл ставок» — у кількох композиціях, на однакових даних. Перші дві —
          нові, у напрямі скла й Stripe. Нічого тут не зберігається.
        </p>
      </div>

      <div className="space-y-12">
        {CONCEPTS.map((c, i) => (
          <section key={c.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 border-b pb-2">
              <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <h2 className="text-lg font-semibold">{c.name}</h2>
              <span className="text-xs text-muted-foreground">{c.type}</span>
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">{c.idea}</p>
            <div className="overflow-hidden rounded-lg border">
              <c.Component />
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Ціна:</span> {c.cost}
            </p>
          </section>
        ))}
      </div>
    </AnimatedPage>
  );
}
