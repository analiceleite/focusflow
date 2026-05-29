export interface ActivityType {
  id?: string;
  name: string;
  icon: string;
  color: string;
  userId: string;
}

export interface Preset {
  id?: string;
  label: string;
  minutes: number;
  userId: string;
}

export interface Session {
  id?: string;
  userId: string;
  activityTypeId: string;
  activityTypeName: string;
  activityColor: string;
  durationSeconds: number;
  mode: 'pomodoro' | 'stopwatch';
  date: string; // YYYY-MM-DD
  startedAt: number; // timestamp
  completedAt: number; // timestamp
}

export interface DailyGoalSegment {
  activityTypeId: string;
  name: string;
  icon: string;
  color: string;
  totalSeconds: number;
  percentage: number;
}