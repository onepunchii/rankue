import { TagCloud } from "react-tagcloud";
import { 
  BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer 
} from "recharts";

export const chartTheme = {
  colors: {
    primary: '#2563eb',
    secondary: '#3b82f6',
    tertiary: '#60a5fa',
    accent: '#0ea5e9',
    light: '#06b6d4',
  },
  palette: ['#2563eb', '#3b82f6', '#60a5fa', '#0ea5e9', '#06b6d4'],
  neutral: {
    gray50: '#f9fafb',
    gray100: '#f3f4f6',
    gray200: '#e5e7eb',
    gray400: '#9ca3af',
    gray600: '#4b5563',
  },
  typography: {
    small: 11,
    medium: 13,
    large: 15,
  },
};

interface KPIRadarChartProps {
  data: Array<{
    subject: string;
    score: number;
  }>;
}

export const KPIRadarChart = ({ data }: KPIRadarChartProps) => {
  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={data}>
        <PolarGrid stroke={chartTheme.neutral.gray200} />
        <PolarAngleAxis 
          dataKey="subject" 
          tick={{ fill: chartTheme.neutral.gray600, fontSize: chartTheme.typography.medium }}
        />
        <PolarRadiusAxis 
          angle={90} 
          domain={[0, 100]}
          tick={{ fill: chartTheme.neutral.gray400, fontSize: chartTheme.typography.small }}
        />
        <Radar 
          name="점수" 
          dataKey="score" 
          stroke={chartTheme.colors.primary} 
          fill={chartTheme.colors.primary}
          fillOpacity={0.3}
        />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
};

interface GaugeChartProps {
  score: number;
  maxScore?: number;
  title?: string;
}

export const GaugeChart = ({ score, maxScore = 100, title }: GaugeChartProps) => {
  const normalizedScore = (score / maxScore) * 100;
  const data = [
    { name: 'Score', value: normalizedScore, fill: chartTheme.colors.primary },
    { name: 'Remaining', value: 100 - normalizedScore, fill: chartTheme.neutral.gray100 },
  ];

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="70%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <div className="text-3xl font-bold text-blue-600">{score.toFixed(1)}</div>
        {title && <div className="text-xs text-gray-500 mt-1">{title}</div>}
      </div>
    </div>
  );
};

interface LikertBarProps {
  data: Array<{ answer: string; count: number }>;
  showAverage?: boolean;
  average?: number;
}

export const LikertBar = ({ data, showAverage, average }: LikertBarProps) => {
  return (
    <div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.neutral.gray100} />
          <XAxis 
            dataKey="answer" 
            angle={-10} 
            textAnchor="end" 
            height={80} 
            fontSize={chartTheme.typography.small}
            stroke={chartTheme.neutral.gray400}
          />
          <YAxis stroke={chartTheme.neutral.gray400} fontSize={chartTheme.typography.small} />
          <Tooltip />
          <Bar 
            dataKey="count" 
            fill={chartTheme.colors.primary}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
      {showAverage && average !== undefined && (
        <div className="mt-2 text-center">
          <span className="text-sm text-gray-600">평균: </span>
          <span className="text-lg font-bold text-blue-600">{average.toFixed(2)}</span>
          <span className="text-sm text-gray-500"> / 5.0</span>
        </div>
      )}
    </div>
  );
};

interface DivergingLikertBarProps {
  data: Array<{ answer: string; count: number }>;
}

export const DivergingLikertBar = ({ data }: DivergingLikertBarProps) => {
  const total = data.reduce((sum, item) => sum + item.count, 0);
  
  const transformedData = data.map((item, index) => {
    const isNegative = index < data.length / 2;
    return {
      ...item,
      value: isNegative ? -item.count : item.count,
      fill: isNegative ? chartTheme.neutral.gray400 : chartTheme.colors.primary,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={transformedData} layout="horizontal">
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.neutral.gray100} />
        <XAxis type="number" stroke={chartTheme.neutral.gray400} fontSize={chartTheme.typography.small} />
        <YAxis 
          dataKey="answer" 
          type="category" 
          width={120}
          fontSize={chartTheme.typography.small}
          stroke={chartTheme.neutral.gray400}
        />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {transformedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

interface DonutChartProps {
  data: Array<{ answer: string; count: number }>;
}

export const DonutChart = ({ data }: DonutChartProps) => {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          dataKey="count"
          label={({ answer, percent }) => `${answer} ${(percent * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={chartTheme.palette[index % chartTheme.palette.length]} 
            />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
};

interface WordCloudChartProps {
  responses: Array<{ answer: string; userId: string }>;
  minSize?: number;
  maxSize?: number;
}

export const WordCloudChart = ({ responses, minSize = 14, maxSize = 50 }: WordCloudChartProps) => {
  const words = responses.map(r => r.answer.trim()).filter(Boolean);
  
  const wordFrequency: Record<string, number> = {};
  words.forEach(text => {
    const tokens = text.split(/\s+/);
    tokens.forEach(token => {
      if (token.length > 1) {
        wordFrequency[token] = (wordFrequency[token] || 0) + 1;
      }
    });
  });

  const cloudData = Object.entries(wordFrequency)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);

  if (cloudData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        분석할 텍스트가 충분하지 않습니다
      </div>
    );
  }

  return (
    <div className="p-4" style={{ minHeight: '300px' }}>
      <TagCloud
        minSize={minSize}
        maxSize={maxSize}
        tags={cloudData}
        colorOptions={{
          luminosity: 'dark',
          hue: 'blue',
        }}
      />
    </div>
  );
};

interface VerticalGroupedBarProps {
  data: Array<{ answer: string; count: number }>;
}

export const VerticalGroupedBar = ({ data }: VerticalGroupedBarProps) => {
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 40)}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.neutral.gray100} />
        <XAxis type="number" stroke={chartTheme.neutral.gray400} fontSize={chartTheme.typography.small} />
        <YAxis 
          dataKey="answer" 
          type="category" 
          width={180}
          fontSize={chartTheme.typography.small}
          stroke={chartTheme.neutral.gray400}
        />
        <Tooltip />
        <Bar 
          dataKey="count" 
          fill={chartTheme.colors.primary}
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

const ChartComponents = {
  KPIRadarChart,
  GaugeChart,
  LikertBar,
  DivergingLikertBar,
  DonutChart,
  WordCloudChart,
  VerticalGroupedBar,
};

export default ChartComponents;
