import path from 'node:path';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from '@react-pdf/renderer';

// The two ranked bar charts the university already circulates, rebuilt from the
// database. Geometry and colours follow the reference PDFs (produced in Word),
// so a generated report drops into the same pile as the hand-made ones:
//
//   #4472C4  the single series on «Рейтинг кафедр»
//   #C00000  the year's total on a department's staff chart
//   #0070C0  the chosen розділ on that same chart
//
// Red for a total is not a warning here — it is their house style, and matching
// it matters more than our own colour habits.

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');

Font.register({
  family: 'Roboto',
  fonts: [
    { src: path.join(FONT_DIR, 'roboto-400.ttf'), fontWeight: 400 },
    { src: path.join(FONT_DIR, 'roboto-700.ttf'), fontWeight: 700 },
  ],
});

// Ukrainian department names are long; letting the layout hyphenate them breaks
// words in places no reader expects.
Font.registerHyphenationCallback((word) => [word]);

const COLOR_SINGLE = '#4472C4';
const COLOR_TOTAL = '#C00000';
const COLOR_METRIC = '#0070C0';
const COLOR_GRID = '#D9D9D9';
const COLOR_INK = '#404040';

// A4 portrait, minus the page padding below
const PAGE_WIDTH = 595.28;
const PADDING = 28;
const CONTENT_WIDTH = PAGE_WIDTH - PADDING * 2;

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    paddingTop: PADDING,
    paddingBottom: PADDING,
    paddingHorizontal: PADDING,
    color: COLOR_INK,
  },
  title: { fontSize: 12, fontWeight: 700, textAlign: 'center', color: '#000' },
  subtitle: { fontSize: 10, textAlign: 'center', marginTop: 3, marginBottom: 12 },
  label: { fontSize: 6.5, textAlign: 'right', paddingRight: 5 },
  value: { fontSize: 6.5, paddingLeft: 3 },
  tick: { fontSize: 6.5, color: COLOR_INK },
  legendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 7 },
  footer: { position: 'absolute', bottom: 14, left: PADDING, right: PADDING },
  footerText: { fontSize: 6.5, color: '#808080', textAlign: 'right' },
});

const number = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });

/** Axis steps a person reads: 1/2/5 × a power of ten, aiming for ~8 ticks */
export function axisTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 8;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const ticks: number[] = [];
  // Run past the largest value, never stop just short of it: the last tick is
  // the scale's end, and a bar longer than the scale spills out of the plot.
  for (let t = 0; ticks.length < 24; t += step) {
    ticks.push(t);
    if (t >= max) break;
  }
  return ticks;
}

interface Row {
  label: string;
  /** One entry for a single-series chart, two for a grouped one */
  values: number[];
}

function BarChart({
  rows,
  colors,
  labelWidth,
  height,
}: {
  rows: Row[];
  colors: string[];
  labelWidth: number;
  height: number;
}) {
  const plotWidth = CONTENT_WIDTH - labelWidth - 34; // 34pt of room for the tip label
  const max = Math.max(...rows.flatMap((r) => r.values), 0);
  const ticks = axisTicks(max);
  const axisMax = ticks[ticks.length - 1] || 1;

  // Rows share the whole plot so a short list fills the sheet instead of
  // huddling at the top. The bar keeps its own cap, so a tall row turns into
  // air around a thin mark rather than a fat block.
  const rowHeight = Math.max(7, Math.min(40, height / Math.max(rows.length, 1)));
  const single = colors.length === 1;
  const barHeight = Math.max(
    2,
    Math.round(Math.min(rowHeight * (single ? 0.5 : 0.32), single ? 14 : 9))
  );
  const plotHeight = rowHeight * rows.length;

  return (
    <View>
      <View style={{ position: 'relative', height: plotHeight }}>
        {/* Gridlines sit under the bars: drawn first, hairline, one step off white */}
        {ticks.map((t) => (
          <View
            key={`grid-${t}`}
            style={{
              position: 'absolute',
              left: labelWidth + (t / axisMax) * plotWidth,
              top: 0,
              width: 0.75,
              height: plotHeight,
              backgroundColor: COLOR_GRID,
            }}
          />
        ))}

        {rows.map((row, i) => (
          <View
            key={`${row.label}-${i}`}
            style={{
              position: 'absolute',
              top: i * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View style={{ width: labelWidth }}>
              <Text style={styles.label}>{row.label}</Text>
            </View>

            <View style={{ width: plotWidth + 34 }}>
              {row.values.map((value, s) => (
                <View
                  key={`s-${s}`}
                  style={{ flexDirection: 'row', alignItems: 'center', height: barHeight + 1 }}
                >
                  <View
                    style={{
                      width: Math.max((value / axisMax) * plotWidth, value > 0 ? 0.5 : 0),
                      height: barHeight,
                      backgroundColor: colors[s],
                    }}
                  />
                  <Text style={styles.value}>{number.format(Math.round(value * 100) / 100)}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* Axis labels, each centred on its gridline */}
      <View style={{ position: 'relative', height: 12, marginTop: 2 }}>
        {ticks.map((t) => (
          <Text
            key={`tick-${t}`}
            style={{
              ...styles.tick,
              position: 'absolute',
              left: labelWidth + (t / axisMax) * plotWidth - 14,
              width: 28,
              textAlign: 'center',
            }}
          >
            {number.format(t)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={{ width: 8, height: 8, backgroundColor: item.color }} />
          <Text style={styles.legendText}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Footer({ generatedAt }: { generatedAt: Date }) {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        EduRank · сформовано {generatedAt.toLocaleDateString('uk-UA')}
      </Text>
    </View>
  );
}

/** «Рейтинг кафедр за показником …» — one bar per department, its average НПП */
export function DepartmentChartDocument({
  rows,
  year,
  metricTitle,
  generatedAt = new Date(),
}: {
  rows: { name: string; value: number }[];
  year: number;
  metricTitle: string;
  generatedAt?: Date;
}): React.ReactElement<DocumentProps> {
  return (
    <Document title={`Рейтинг кафедр ${year}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Рейтинг кафедр за {metricTitle} НПП</Text>
        <Text style={styles.subtitle}>за {year} рік</Text>

        <BarChart
          rows={rows.map((r) => ({ label: r.name, values: [r.value] }))}
          colors={[COLOR_SINGLE]}
          labelWidth={250}
          height={640}
        />

        <Legend items={[{ color: COLOR_SINGLE, label: 'Середнє' }]} />
        <Footer generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}

/** One department: every НПП with the year's total beside the chosen розділ */
export function DepartmentStaffDocument({
  departmentName,
  rows,
  year,
  metricLegend,
  showMetricSeries,
  generatedAt = new Date(),
}: {
  departmentName: string;
  rows: { name: string; total: number; value: number }[];
  year: number;
  metricLegend: string;
  /** False when the metric is the total itself — one bar, not two identical ones */
  showMetricSeries: boolean;
  generatedAt?: Date;
}): React.ReactElement<DocumentProps> {
  const colors = showMetricSeries ? [COLOR_TOTAL, COLOR_METRIC] : [COLOR_TOTAL];

  return (
    <Document title={`${departmentName} ${year}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{departmentName}</Text>
        <Text style={styles.subtitle}>за {year} рік</Text>

        <BarChart
          rows={rows.map((r) => ({
            label: r.name,
            values: showMetricSeries ? [r.total, r.value] : [r.total],
          }))}
          colors={colors}
          labelWidth={170}
          height={620}
        />

        <Legend
          items={[
            { color: COLOR_TOTAL, label: 'Загальна сума балів за рейтинговим оцінюванням' },
            ...(showMetricSeries ? [{ color: COLOR_METRIC, label: metricLegend }] : []),
          ]}
        />
        <Footer generatedAt={generatedAt} />
      </Page>
    </Document>
  );
}
