import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart, ProgressChart } from 'react-native-chart-kit';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const screenWidth = Dimensions.get('window').width;

// =============================================================================
// TYPES - Mirror backend guaranteed structures
// =============================================================================

interface Booking {
  id: string;
  profit: number;
  is_prepaid: boolean;
  has_refund_protection: boolean;
  timestamp: string;
  time_since_last: number;
}

interface SpinEntry {
  id: string;
  amount: number;
  is_mega: boolean;
  booking_number: number;
  timestamp: string;
}

interface MiscIncome {
  id: string;
  amount: number;
  source: string;
  description: string;
  timestamp: string;
}

interface DailyEntry {
  id: string;
  date: string;
  calls_received: number;
  bookings: Booking[];
  spins: SpinEntry[];
  misc_income: MiscIncome[];
}

// Guaranteed complete from backend - no optionals
interface MetricStat {
  total: number;
  goal: number;
  progress_percent: number;
  on_track: boolean;
  status: string;
}

interface ConversionStat {
  rate: number;
  goal: number;
  on_track: boolean;
  status: string;
}

interface TimeStat {
  average: number;
  goal: number;
  on_track: boolean;
  status: string;
}

interface SpinAverages {
  regular: number;
  regular_goal: number;
  mega: number;
  mega_goal: number;
}

interface ReservationStat extends MetricStat {
  prepaid_count: number;
  refund_protection_count: number;
}

interface DailyStats {
  date: string;
  calls: MetricStat;
  reservations: MetricStat;
  conversion_rate: ConversionStat;
  profit: MetricStat;
  spins: MetricStat;
  avg_time: TimeStat;
}

interface BiweeklyStats {
  period: string;
  period_id?: string;
  start_date: string;
  end_date: string;
  days_tracked: number;
  calls: MetricStat;
  reservations: ReservationStat;
  conversion_rate: ConversionStat;
  profit: MetricStat;
  spins: MetricStat;
  combined: MetricStat;
  misc: MetricStat;
  avg_time: TimeStat;
  spin_averages: SpinAverages;
}

// Period Archive Types
interface PeriodTotals {
  calls: number;
  reservations: number;
  profit: number;
  spins: number;
  combined: number;
  misc: number;
  prepaid_count: number;
  refund_protection_count: number;
}

interface GoalsMet {
  calls: boolean;
  reservations: boolean;
  profit: boolean;
  spins: boolean;
  combined: boolean;
  misc: boolean;
}

interface PeriodLog {
  id: string;
  period_id: string;
  start_date: string;
  end_date: string;
  status: string;
  entry_count: number;
  totals: PeriodTotals;
  goals: Record<string, number>;
  goals_met: GoalsMet;
  conversion_rate: number;
  avg_time_per_booking: number;
  archived_at: string;
}

interface CurrentPeriodInfo {
  period_id: string;
  start_date: string;
  end_date: string;
  is_boundary_day: boolean;
  days_remaining: number;
  previous_period: {
    period_id: string;
    is_archived: boolean;
  };
}

type TabType = 'today' | 'biweekly' | 'history';
type ModalType = 'booking' | 'spin' | 'misc' | null;
type HistoryViewType = 'list' | 'charts';

// =============================================================================
// SAFE ACCESSORS - Defense against API garbage
// =============================================================================

const safeMetric = (stat: MetricStat | undefined | null): MetricStat => ({
  total: stat?.total ?? 0,
  goal: stat?.goal ?? 0,
  progress_percent: stat?.progress_percent ?? 0,
  on_track: stat?.on_track ?? false,
  status: stat?.status ?? 'behind',
});

const safeConversion = (stat: ConversionStat | undefined | null): ConversionStat => ({
  rate: stat?.rate ?? 0,
  goal: stat?.goal ?? 0,
  on_track: stat?.on_track ?? false,
  status: stat?.status ?? 'behind',
});

const safeTime = (stat: TimeStat | undefined | null): TimeStat => ({
  average: stat?.average ?? 0,
  goal: stat?.goal ?? 30,
  on_track: stat?.on_track ?? true,
  status: stat?.status ?? 'on_track',
});

const safeSpinAverages = (stat: SpinAverages | undefined | null): SpinAverages => ({
  regular: stat?.regular ?? 0,
  regular_goal: stat?.regular_goal ?? 5,
  mega: stat?.mega ?? 0,
  mega_goal: stat?.mega_goal ?? 49,
});

const safeReservation = (stat: ReservationStat | undefined | null): ReservationStat => ({
  ...safeMetric(stat),
  prepaid_count: stat?.prepaid_count ?? 0,
  refund_protection_count: stat?.refund_protection_count ?? 0,
});

const safeEntry = (entry: DailyEntry | undefined | null): DailyEntry => ({
  id: entry?.id ?? '',
  date: entry?.date ?? new Date().toISOString().split('T')[0],
  calls_received: entry?.calls_received ?? 0,
  bookings: entry?.bookings ?? [],
  spins: entry?.spins ?? [],
  misc_income: entry?.misc_income ?? [],
});

// =============================================================================
// UI HELPERS - Status to color mapping (business logic stays in backend)
// =============================================================================

const statusColor = (status: string): string => {
  switch (status) {
    case 'on_track': return '#10B981';
    case 'warning': return '#F59E0B';
    case 'behind':
    default: return '#EF4444';
  }
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function Index() {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [todayEntry, setTodayEntry] = useState<DailyEntry | null>(null);
  const [biweeklyStats, setBiweeklyStats] = useState<BiweeklyStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState<ModalType>(null);
  
  // History tab states - moved to top level to avoid hooks error
  const [periodLogs, setPeriodLogs] = useState<PeriodLog[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<CurrentPeriodInfo | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyView, setHistoryView] = useState<HistoryViewType>('list');
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  
  // Form states
  const [callsInput, setCallsInput] = useState('');
  const [bookingProfit, setBookingProfit] = useState('');
  const [isPrepaid, setIsPrepaid] = useState(false);
  const [hasRefundProtection, setHasRefundProtection] = useState(false);
  const [timeSinceLast, setTimeSinceLast] = useState('');
  const [spinAmount, setSpinAmount] = useState<number>(0);
  const [isMegaSpin, setIsMegaSpin] = useState(false);
  const [miscAmount, setMiscAmount] = useState('');
  const [miscSource, setMiscSource] = useState<'request_lead' | 'refund_protection'>('request_lead');
  const [miscDescription, setMiscDescription] = useState('');

  const today = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    try {
      const [entryRes, biweeklyRes, dailyRes] = await Promise.all([
        fetch(`${API_URL}/api/entries/today`),
        fetch(`${API_URL}/api/stats/biweekly`),
        fetch(`${API_URL}/api/stats/daily/${today}`),
      ]);
      
      if (entryRes.ok) {
        const entry = await entryRes.json();
        setTodayEntry(entry);
        setCallsInput(String(entry?.calls_received ?? 0));
      }
      if (biweeklyRes.ok) {
        setBiweeklyStats(await biweeklyRes.json());
      }
      if (dailyRes.ok) {
        setDailyStats(await dailyRes.json());
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch history data when History tab is active
  useEffect(() => {
    if (activeTab === 'history') {
      const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
          const [periodsRes, currentRes] = await Promise.all([
            fetch(`${API_URL}/api/periods`),
            fetch(`${API_URL}/api/periods/current`),
          ]);
          if (periodsRes.ok) setPeriodLogs(await periodsRes.json());
          if (currentRes.ok) setCurrentPeriod(await currentRes.json());
        } catch (error) {
          console.error('Error fetching history:', error);
        } finally {
          setLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const updateCalls = async () => {
    try {
      const res = await fetch(`${API_URL}/api/entries/${today}/calls?calls_received=${parseInt(callsInput) || 0}`, {
        method: 'PUT',
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error('Error updating calls:', error);
    }
  };

  const addBooking = async () => {
    if (!bookingProfit) return;
    try {
      const res = await fetch(`${API_URL}/api/entries/${today}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profit: parseFloat(bookingProfit),
          is_prepaid: isPrepaid,
          has_refund_protection: hasRefundProtection,
          time_since_last: timeSinceLast ? parseInt(timeSinceLast) : 0,
        }),
      });
      if (res.ok) {
        setBookingProfit('');
        setIsPrepaid(false);
        setHasRefundProtection(false);
        setTimeSinceLast('');
        setModalVisible(null);
        fetchData();
      }
    } catch (error) {
      console.error('Error adding booking:', error);
    }
  };

  const addSpin = async () => {
    if (!spinAmount) return;
    const entry = safeEntry(todayEntry);
    try {
      const res = await fetch(`${API_URL}/api/entries/${today}/spins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: spinAmount,
          is_mega: isMegaSpin,
          booking_number: entry.bookings.length,
        }),
      });
      if (res.ok) {
        setSpinAmount(0);
        setIsMegaSpin(false);
        setModalVisible(null);
        fetchData();
      }
    } catch (error) {
      console.error('Error adding spin:', error);
    }
  };

  const addMiscIncome = async () => {
    if (!miscAmount) return;
    try {
      const res = await fetch(`${API_URL}/api/entries/${today}/misc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(miscAmount),
          source: miscSource,
          description: miscDescription,
        }),
      });
      if (res.ok) {
        setMiscAmount('');
        setMiscSource('request_lead');
        setMiscDescription('');
        setModalVisible(null);
        fetchData();
      }
    } catch (error) {
      console.error('Error adding misc income:', error);
    }
  };

  const deleteBooking = async (bookingId: string) => {
    Alert.alert('Delete Booking', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/entries/${today}/bookings/${bookingId}`, { method: 'DELETE' });
            fetchData();
          } catch (error) {
            console.error('Error deleting booking:', error);
          }
        },
      },
    ]);
  };

  // =============================================================================
  // COMPONENTS
  // =============================================================================

  const ProgressBar = ({ progress, status }: { progress: number; status: string }) => (
    <View style={styles.progressBarContainer}>
      <View
        style={[
          styles.progressBarFill,
          { width: `${Math.min(progress, 100)}%`, backgroundColor: statusColor(status) },
        ]}
      />
    </View>
  );

  const StatCard = ({ title, stat, icon }: { title: string; stat: MetricStat; icon: string }) => {
    const s = safeMetric(stat);
    const color = statusColor(s.status);
    const isMonetary = title === 'Profit' || title === 'Spins';
    
    return (
      <View style={[styles.statCard, { borderLeftColor: color }]}>
        <View style={styles.statHeader}>
          <Ionicons name={icon as any} size={20} color={color} />
          <Text style={styles.statTitle}>{title}</Text>
        </View>
        <Text style={styles.statValue}>
          {isMonetary ? `$${s.total.toFixed(2)}` : s.total}
        </Text>
        <Text style={styles.statGoal}>
          Goal: {isMonetary ? `$${s.goal.toFixed(2)}` : s.goal}
        </Text>
        <ProgressBar progress={s.progress_percent} status={s.status} />
        <Text style={[styles.statPercent, { color }]}>
          {s.progress_percent.toFixed(1)}%
        </Text>
      </View>
    );
  };

  const InfoCard = ({ icon, label, value, status }: { icon: string; label: string; value: string; status?: string }) => (
    <View style={[styles.avgTimeCard, { backgroundColor: status ? (status === 'on_track' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)') : 'rgba(99,102,241,0.2)' }]}>
      <Ionicons name={icon as any} size={20} color={status ? statusColor(status) : '#6366F1'} />
      <Text style={styles.avgTimeText}>{label}: {value}</Text>
    </View>
  );

  // =============================================================================
  // TABS
  // =============================================================================

  const renderTodayTab = () => {
    const stats = dailyStats;
    const entry = safeEntry(todayEntry);
    
    if (!stats) return null;
    
    const calls = safeMetric(stats.calls);
    const reservations = safeMetric(stats.reservations);
    const profit = safeMetric(stats.profit);
    const spins = safeMetric(stats.spins);
    const conversion = safeConversion(stats.conversion_rate);
    const avgTime = safeTime(stats.avg_time);
    const combined = safeMetric(biweeklyStats?.combined);

    const totalBookings = entry.bookings.length;
    const totalProfit = entry.bookings.reduce((sum, b) => sum + (b?.profit ?? 0), 0);
    const totalSpins = entry.spins.reduce((sum, s) => sum + (s?.amount ?? 0), 0);
    const totalMisc = entry.misc_income.reduce((sum, m) => sum + (m?.amount ?? 0), 0);
    
    const bookingsUntilSpin = 4 - (totalBookings % 4);
    const spinNumber = Math.floor(totalBookings / 4);
    const isMegaNext = (spinNumber + 1) % 4 === 0;

    return (
      <ScrollView style={styles.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, combined.on_track ? styles.statusBannerGood : styles.statusBannerWarning]}>
          <Ionicons name={combined.on_track ? 'checkmark-circle' : 'alert-circle'} size={24} color="#fff" />
          <Text style={styles.statusBannerText}>
            {combined.on_track ? 'On Track for $1,800 Biweekly!' : `$${combined.total.toFixed(0)} / $1,800 Combined`}
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <StatCard title="Calls" stat={calls} icon="call" />
          <StatCard title="Reservations" stat={reservations} icon="calendar" />
          <StatCard title="Profit" stat={profit} icon="cash" />
          <StatCard title="Spins" stat={spins} icon="star" />
        </View>

        {/* Info Cards */}
        {avgTime.average > 0 && (
          <InfoCard 
            icon="time" 
            label="Avg Time" 
            value={`${avgTime.average} min (Goal: ≤${avgTime.goal})`}
            status={avgTime.status}
          />
        )}
        <InfoCard 
          icon="trending-up" 
          label="Conversion" 
          value={`${conversion.rate}% (Goal: ${conversion.goal}%)`}
          status={conversion.status}
        />

        {/* Calls Input */}
        <View style={styles.inputSection}>
          <Text style={styles.sectionTitle}>Update Calls Received</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={callsInput}
              onChangeText={setCallsInput}
              keyboardType="numeric"
              placeholder="Enter calls"
              placeholderTextColor="#666"
            />
            <TouchableOpacity style={styles.updateButton} onPress={updateCalls}>
              <Text style={styles.updateButtonText}>Update</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Add */}
        <View style={styles.quickAddSection}>
          <TouchableOpacity style={styles.quickAddButton} onPress={() => setModalVisible('booking')}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.quickAddText}>Add Booking</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickAddButton, styles.bonusButton]} onPress={() => setModalVisible('spin')}>
            <Ionicons name="star" size={24} color="#fff" />
            <Text style={styles.quickAddText}>Add Spin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.quickAddButton, styles.miscButton]} onPress={() => setModalVisible('misc')}>
            <Ionicons name="wallet" size={24} color="#fff" />
            <Text style={styles.quickAddText}>Add Misc</Text>
          </TouchableOpacity>
        </View>

        {/* Next Spin */}
        <View style={styles.nextBonusCard}>
          <Text style={styles.nextBonusTitle}>Next Spin</Text>
          <Text style={styles.nextBonusText}>
            {totalBookings % 4 === 0 && totalBookings > 0
              ? 'Spin earned! Add it above.'
              : `${bookingsUntilSpin} more booking(s) until spin`}
          </Text>
          {isMegaNext && <Text style={styles.megaBonusText}>MEGA SPIN incoming!</Text>}
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Today's Earnings</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Booking Profit:</Text>
            <Text style={styles.summaryValue}>${totalProfit.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Spins:</Text>
            <Text style={styles.summaryValue}>${totalSpins.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Misc Income:</Text>
            <Text style={styles.summaryValue}>${totalMisc.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryTotalLabel}>Total:</Text>
            <Text style={styles.summaryTotalValue}>${(totalProfit + totalSpins + totalMisc).toFixed(2)}</Text>
          </View>
        </View>

        {/* Bookings List */}
        {entry.bookings.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Today's Bookings ({entry.bookings.length})</Text>
            {entry.bookings.slice().reverse().map((booking) => (
              <View key={booking.id} style={styles.bookingItem}>
                <View style={styles.bookingInfo}>
                  <Text style={styles.bookingProfit}>${(booking?.profit ?? 0).toFixed(2)}</Text>
                  <View style={styles.bookingTags}>
                    {booking?.is_prepaid && <View style={styles.tag}><Text style={styles.tagText}>Prepaid</Text></View>}
                    {booking?.has_refund_protection && <View style={[styles.tag, styles.tagRefund]}><Text style={styles.tagText}>Refund Prot.</Text></View>}
                  </View>
                </View>
                <TouchableOpacity onPress={() => deleteBooking(booking.id)}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  const renderBiweeklyTab = () => {
    if (!biweeklyStats) return null;

    const calls = safeMetric(biweeklyStats.calls);
    const reservations = safeReservation(biweeklyStats.reservations);
    const profit = safeMetric(biweeklyStats.profit);
    const spins = safeMetric(biweeklyStats.spins);
    const combined = safeMetric(biweeklyStats.combined);
    const misc = safeMetric(biweeklyStats.misc);
    const conversion = safeConversion(biweeklyStats.conversion_rate);
    const avgTime = safeTime(biweeklyStats.avg_time);
    const spinAvg = safeSpinAverages(biweeklyStats.spin_averages);

    return (
      <ScrollView style={styles.tabContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.periodHeader}>
          <Text style={styles.periodTitle}>Biweekly Progress</Text>
          <Text style={styles.periodDates}>
            {biweeklyStats.start_date ?? ''} to {biweeklyStats.end_date ?? ''}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <StatCard title="Calls" stat={calls} icon="call" />
          <StatCard title="Reservations" stat={reservations} icon="calendar" />
          <StatCard title="Profit" stat={profit} icon="cash" />
          <StatCard title="Spins" stat={spins} icon="star" />
        </View>

        {/* Combined Target */}
        <View style={styles.earningsCard}>
          <Text style={styles.earningsTitle}>Combined Target: $1,800</Text>
          <ProgressBar progress={combined.progress_percent} status={combined.status} />
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>Profit + Spins:</Text>
            <Text style={[styles.earningsValue, { color: statusColor(combined.status) }]}>
              ${combined.total.toFixed(2)}
            </Text>
          </View>
          <View style={styles.earningsRow}>
            <Text style={styles.earningsLabel}>Misc Income:</Text>
            <Text style={styles.earningsValue}>${misc.total.toFixed(2)} / ${misc.goal.toFixed(2)}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Performance Details</Text>
          <View style={styles.detailsRow}>
            <Ionicons name="trending-up" size={20} color={statusColor(conversion.status)} />
            <Text style={styles.detailsLabel}>Conversion Rate:</Text>
            <Text style={[styles.detailsValue, { color: statusColor(conversion.status) }]}>
              {conversion.rate}%
            </Text>
          </View>
          <View style={styles.detailsRow}>
            <Ionicons name="time" size={20} color={statusColor(avgTime.status)} />
            <Text style={styles.detailsLabel}>Avg Time/Booking:</Text>
            <Text style={[styles.detailsValue, { color: statusColor(avgTime.status) }]}>
              {avgTime.average} min
            </Text>
          </View>
          <View style={styles.detailsRow}>
            <Ionicons name="card" size={20} color="#6366F1" />
            <Text style={styles.detailsLabel}>Prepaid Bookings:</Text>
            <Text style={styles.detailsValue}>{reservations.prepaid_count}</Text>
          </View>
          <View style={styles.detailsRow}>
            <Ionicons name="shield-checkmark" size={20} color="#10B981" />
            <Text style={styles.detailsLabel}>Refund Protection:</Text>
            <Text style={styles.detailsValue}>{reservations.refund_protection_count}</Text>
          </View>
        </View>

        {/* Spin Averages */}
        <View style={styles.bonusAvgCard}>
          <Text style={styles.bonusAvgTitle}>Spin Averages</Text>
          <View style={styles.bonusAvgRow}>
            <View style={styles.bonusAvgItem}>
              <Text style={styles.bonusAvgLabel}>Regular Avg</Text>
              <Text style={[styles.bonusAvgValue, { color: spinAvg.regular >= spinAvg.regular_goal ? '#10B981' : '#EF4444' }]}>
                ${spinAvg.regular.toFixed(2)}
              </Text>
              <Text style={styles.bonusAvgGoal}>Goal: ${spinAvg.regular_goal.toFixed(2)}</Text>
            </View>
            <View style={styles.bonusAvgItem}>
              <Text style={styles.bonusAvgLabel}>Mega Avg</Text>
              <Text style={[styles.bonusAvgValue, { color: spinAvg.mega >= spinAvg.mega_goal ? '#10B981' : '#EF4444' }]}>
                ${spinAvg.mega.toFixed(2)}
              </Text>
              <Text style={styles.bonusAvgGoal}>Goal: ${spinAvg.mega_goal.toFixed(2)}</Text>
            </View>
          </View>
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  const renderHistoryTab = () => {
    // Calculate predictions for next period
    const calculatePredictions = () => {
      if (!biweeklyStats || periodLogs.length === 0) {
        return {
          callsPerDay: 142,
          bookingsPerDay: 22,
          profitPerDay: 72.08,
          recommendedWorkDays: 12,
          avgCallsNeeded: 1710,
          avgBookingsNeeded: 270,
        };
      }

      // Average from past periods
      const pastPeriods = periodLogs.filter(p => p.status === 'closed');
      if (pastPeriods.length === 0) {
        return {
          callsPerDay: 142,
          bookingsPerDay: 22,
          profitPerDay: 72.08,
          recommendedWorkDays: 12,
          avgCallsNeeded: 1710,
          avgBookingsNeeded: 270,
        };
      }

      const avgCalls = pastPeriods.reduce((sum, p) => sum + p.totals.calls, 0) / pastPeriods.length;
      const avgBookings = pastPeriods.reduce((sum, p) => sum + p.totals.reservations, 0) / pastPeriods.length;
      const avgProfit = pastPeriods.reduce((sum, p) => sum + p.totals.profit, 0) / pastPeriods.length;
      const avgDays = pastPeriods.reduce((sum, p) => sum + p.entry_count, 0) / pastPeriods.length;

      const callsPerDay = avgDays > 0 ? Math.ceil(avgCalls / avgDays) : 142;
      const bookingsPerDay = avgDays > 0 ? Math.ceil(avgBookings / avgDays) : 22;
      const profitPerDay = avgDays > 0 ? avgProfit / avgDays : 72.08;

      // To hit goals, calculate what's needed
      const goalCalls = 1710;
      const goalBookings = 270;
      const recommendedWorkDays = Math.max(10, Math.ceil(goalCalls / callsPerDay));

      return {
        callsPerDay: Math.max(callsPerDay, 142),
        bookingsPerDay: Math.max(bookingsPerDay, 22),
        profitPerDay: Math.max(profitPerDay, 72.08),
        recommendedWorkDays,
        avgCallsNeeded: goalCalls,
        avgBookingsNeeded: goalBookings,
      };
    };

    const predictions = calculatePredictions();

    // Chart configuration
    const chartConfig = {
      backgroundColor: '#1E293B',
      backgroundGradientFrom: '#1E293B',
      backgroundGradientTo: '#1E293B',
      decimalPlaces: 0,
      color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
      labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
      style: { borderRadius: 16 },
      propsForDots: { r: '4', strokeWidth: '2', stroke: '#6366F1' },
    };

    // Format period data for charts
    const getChartData = () => {
      const periods = [...periodLogs].reverse().slice(-6); // Last 6 periods
      if (periods.length === 0) {
        return {
          labels: ['No Data'],
          datasets: [{ data: [0] }],
        };
      }
      return {
        labels: periods.map(p => {
          const startDate = new Date(p.start_date);
          return `${startDate.getMonth() + 1}/${startDate.getDate()}`;
        }),
        datasets: [{ data: periods.map(p => p.totals.combined || 0) }],
      };
    };

    const getGoalCompletionData = () => {
      if (!biweeklyStats) return { labels: [], data: [] };
      
      const stats = biweeklyStats;
      return {
        labels: ['Calls', 'Books', 'Profit', 'Spins', 'Misc'],
        data: [
          Math.min((stats.calls.progress_percent || 0) / 100, 1),
          Math.min((stats.reservations.progress_percent || 0) / 100, 1),
          Math.min((stats.profit.progress_percent || 0) / 100, 1),
          Math.min((stats.spins.progress_percent || 0) / 100, 1),
          Math.min((stats.misc.progress_percent || 0) / 100, 1),
        ],
      };
    };

    const getCallsBarData = () => {
      const periods = [...periodLogs].reverse().slice(-6);
      if (periods.length === 0) {
        return { labels: ['No Data'], datasets: [{ data: [0] }] };
      }
      return {
        labels: periods.map(p => {
          const d = new Date(p.start_date);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        }),
        datasets: [{ data: periods.map(p => p.totals.calls || 0) }],
      };
    };

    if (loadingHistory) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
        </View>
      );
    }

    return (
      <ScrollView style={styles.tabContent}>
        {/* View Toggle */}
        <View style={styles.historyToggle}>
          <TouchableOpacity
            style={[styles.historyToggleBtn, historyView === 'list' && styles.historyToggleBtnActive]}
            onPress={() => setHistoryView('list')}
          >
            <Ionicons name="list" size={18} color={historyView === 'list' ? '#fff' : '#64748B'} />
            <Text style={[styles.historyToggleText, historyView === 'list' && styles.historyToggleTextActive]}>
              List
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.historyToggleBtn, historyView === 'charts' && styles.historyToggleBtnActive]}
            onPress={() => setHistoryView('charts')}
          >
            <Ionicons name="bar-chart" size={18} color={historyView === 'charts' ? '#fff' : '#64748B'} />
            <Text style={[styles.historyToggleText, historyView === 'charts' && styles.historyToggleTextActive]}>
              Charts
            </Text>
          </TouchableOpacity>
        </View>

        {/* Current Period Info */}
        {currentPeriod && (
          <View style={styles.currentPeriodCard}>
            <View style={styles.currentPeriodHeader}>
              <Ionicons name="calendar" size={20} color="#6366F1" />
              <Text style={styles.currentPeriodTitle}>Current Period</Text>
            </View>
            <Text style={styles.currentPeriodDates}>
              {currentPeriod.start_date} to {currentPeriod.end_date}
            </Text>
            <View style={styles.daysRemainingBadge}>
              <Text style={styles.daysRemainingText}>
                {currentPeriod.days_remaining} days remaining
              </Text>
            </View>
          </View>
        )}

        {historyView === 'charts' ? (
          <>
            {/* Goal Completion Progress */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Current Period Goal Progress</Text>
              {biweeklyStats && (
                <View style={styles.progressRingsContainer}>
                  <ProgressChart
                    data={getGoalCompletionData()}
                    width={screenWidth - 64}
                    height={200}
                    strokeWidth={12}
                    radius={24}
                    chartConfig={{
                      ...chartConfig,
                      color: (opacity = 1, index) => {
                        const colors = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
                        return colors[index ?? 0] || colors[0];
                      },
                    }}
                    hideLegend={false}
                  />
                </View>
              )}
            </View>

            {/* Combined Earnings Trend */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Combined Earnings Trend</Text>
              <Text style={styles.chartSubtitle}>Last 6 periods</Text>
              <LineChart
                data={getChartData()}
                width={screenWidth - 64}
                height={200}
                chartConfig={chartConfig}
                bezier
                style={styles.chart}
              />
            </View>

            {/* Calls Bar Chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Calls per Period</Text>
              <BarChart
                data={getCallsBarData()}
                width={screenWidth - 64}
                height={200}
                chartConfig={{
                  ...chartConfig,
                  color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                }}
                style={styles.chart}
                yAxisLabel=""
                yAxisSuffix=""
              />
            </View>

            {/* Predictions Card */}
            <View style={styles.predictionsCard}>
              <View style={styles.predictionsHeader}>
                <Ionicons name="bulb" size={24} color="#F59E0B" />
                <Text style={styles.predictionsTitle}>Next Period Predictions</Text>
              </View>
              <Text style={styles.predictionsSubtitle}>
                Based on your historical performance
              </Text>
              
              <View style={styles.predictionRow}>
                <View style={styles.predictionItem}>
                  <Text style={styles.predictionLabel}>Daily Calls Target</Text>
                  <Text style={styles.predictionValue}>{predictions.callsPerDay}</Text>
                </View>
                <View style={styles.predictionItem}>
                  <Text style={styles.predictionLabel}>Daily Bookings Target</Text>
                  <Text style={styles.predictionValue}>{predictions.bookingsPerDay}</Text>
                </View>
              </View>

              <View style={styles.predictionRow}>
                <View style={styles.predictionItem}>
                  <Text style={styles.predictionLabel}>Daily Profit Target</Text>
                  <Text style={styles.predictionValue}>${predictions.profitPerDay.toFixed(2)}</Text>
                </View>
                <View style={styles.predictionItem}>
                  <Text style={styles.predictionLabel}>Work Days Needed</Text>
                  <Text style={styles.predictionValue}>{predictions.recommendedWorkDays}</Text>
                </View>
              </View>

              <View style={styles.recommendationBox}>
                <Ionicons name="information-circle" size={20} color="#6366F1" />
                <Text style={styles.recommendationText}>
                  To hit your goals, aim for {predictions.callsPerDay} calls/day over {predictions.recommendedWorkDays} working days.
                  That's about {Math.ceil(predictions.callsPerDay / 8)} calls per hour in an 8-hour shift.
                </Text>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Period List */}
            <Text style={styles.sectionTitle}>Archived Periods</Text>
            {periodLogs.length === 0 ? (
              <View style={styles.emptyStateCard}>
                <Ionicons name="folder-open" size={48} color="#64748B" />
                <Text style={styles.emptyText}>No archived periods yet</Text>
                <Text style={styles.emptySubtext}>
                  Periods are automatically archived on the 1st and 15th
                </Text>
              </View>
            ) : (
              periodLogs.map((period) => {
                const isExpanded = expandedPeriod === period.period_id;
                const goalsMet = Object.values(period.goals_met).filter(Boolean).length;
                const totalGoals = Object.values(period.goals_met).length;
                const completionPercent = Math.round((goalsMet / totalGoals) * 100);

                return (
                  <TouchableOpacity
                    key={period.id}
                    style={styles.periodCard}
                    onPress={() => setExpandedPeriod(isExpanded ? null : period.period_id)}
                  >
                    <View style={styles.periodHeader}>
                      <View>
                        <Text style={styles.periodDates}>
                          {period.start_date} → {period.end_date}
                        </Text>
                        <Text style={styles.periodEntries}>
                          {period.entry_count} days tracked
                        </Text>
                      </View>
                      <View style={styles.periodRight}>
                        <Text style={styles.periodEarnings}>
                          ${period.totals.combined.toFixed(2)}
                        </Text>
                        <View style={[
                          styles.completionBadge,
                          completionPercent >= 80 ? styles.completionGood :
                          completionPercent >= 50 ? styles.completionWarning :
                          styles.completionBehind
                        ]}>
                          <Text style={styles.completionText}>{completionPercent}% Goals</Text>
                        </View>
                      </View>
                    </View>

                    {isExpanded && (
                      <View style={styles.periodDetails}>
                        <View style={styles.periodStatsGrid}>
                          <View style={styles.periodStatItem}>
                            <Text style={styles.periodStatLabel}>Calls</Text>
                            <Text style={[styles.periodStatValue, { color: period.goals_met.calls ? '#10B981' : '#EF4444' }]}>
                              {period.totals.calls}
                            </Text>
                            <Ionicons 
                              name={period.goals_met.calls ? 'checkmark-circle' : 'close-circle'} 
                              size={16} 
                              color={period.goals_met.calls ? '#10B981' : '#EF4444'} 
                            />
                          </View>
                          <View style={styles.periodStatItem}>
                            <Text style={styles.periodStatLabel}>Bookings</Text>
                            <Text style={[styles.periodStatValue, { color: period.goals_met.reservations ? '#10B981' : '#EF4444' }]}>
                              {period.totals.reservations}
                            </Text>
                            <Ionicons 
                              name={period.goals_met.reservations ? 'checkmark-circle' : 'close-circle'} 
                              size={16} 
                              color={period.goals_met.reservations ? '#10B981' : '#EF4444'} 
                            />
                          </View>
                          <View style={styles.periodStatItem}>
                            <Text style={styles.periodStatLabel}>Profit</Text>
                            <Text style={[styles.periodStatValue, { color: period.goals_met.profit ? '#10B981' : '#EF4444' }]}>
                              ${period.totals.profit.toFixed(0)}
                            </Text>
                            <Ionicons 
                              name={period.goals_met.profit ? 'checkmark-circle' : 'close-circle'} 
                              size={16} 
                              color={period.goals_met.profit ? '#10B981' : '#EF4444'} 
                            />
                          </View>
                          <View style={styles.periodStatItem}>
                            <Text style={styles.periodStatLabel}>Spins</Text>
                            <Text style={[styles.periodStatValue, { color: period.goals_met.spins ? '#10B981' : '#EF4444' }]}>
                              ${period.totals.spins.toFixed(0)}
                            </Text>
                            <Ionicons 
                              name={period.goals_met.spins ? 'checkmark-circle' : 'close-circle'} 
                              size={16} 
                              color={period.goals_met.spins ? '#10B981' : '#EF4444'} 
                            />
                          </View>
                        </View>
                        <View style={styles.periodExtraStats}>
                          <Text style={styles.periodExtraText}>
                            Conversion: {period.conversion_rate.toFixed(1)}%  •  
                            Avg Time: {period.avg_time_per_booking.toFixed(0)} min
                          </Text>
                          <Text style={styles.periodExtraText}>
                            Prepaid: {period.totals.prepaid_count}  •  
                            Refund Prot: {period.totals.refund_protection_count}
                          </Text>
                        </View>
                      </View>
                    )}

                    <View style={styles.expandIcon}>
                      <Ionicons 
                        name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                        size={20} 
                        color="#64748B" 
                      />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading KPI Tracker...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>KPI Tracker</Text>
          <Text style={styles.headerSubtitle}>Reservation Setter Dashboard</Text>
        </View>

        <View style={styles.tabBar}>
          {(['today', 'biweekly', 'history'] as TabType[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'today' && renderTodayTab()}
        {activeTab === 'biweekly' && renderBiweeklyTab()}
        {activeTab === 'history' && renderHistoryTab()}

        {/* Booking Modal */}
        <Modal visible={modalVisible === 'booking'} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Booking</Text>
                <TouchableOpacity onPress={() => setModalVisible(null)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Profit amount ($)"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={bookingProfit}
                onChangeText={setBookingProfit}
              />
              <TextInput
                style={styles.modalInput}
                placeholder="Time since last booking (min)"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={timeSinceLast}
                onChangeText={setTimeSinceLast}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Pre-paid</Text>
                <Switch value={isPrepaid} onValueChange={setIsPrepaid} trackColor={{ true: '#6366F1' }} />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Refund Protection</Text>
                <Switch value={hasRefundProtection} onValueChange={setHasRefundProtection} trackColor={{ true: '#6366F1' }} />
              </View>
              <TouchableOpacity style={styles.modalButton} onPress={addBooking}>
                <Text style={styles.modalButtonText}>Add Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Spin Modal */}
        <Modal visible={modalVisible === 'spin'} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Spin</Text>
                <TouchableOpacity onPress={() => setModalVisible(null)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Spin amount ($)"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={spinAmount.toString()}
                onChangeText={(text) => setSpinAmount(Number(text) || 0)}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Mega Spin (4th spin of day)</Text>
                <Switch value={isMegaSpin} onValueChange={setIsMegaSpin} trackColor={{ true: '#F59E0B' }} />
              </View>
              <TouchableOpacity style={[styles.modalButton, styles.bonusModalButton]} onPress={addSpin}>
                <Text style={styles.modalButtonText}>Add Spin</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Misc Modal */}
        <Modal visible={modalVisible === 'misc'} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Misc Income</Text>
                <TouchableOpacity onPress={() => setModalVisible(null)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Amount ($)"
                placeholderTextColor="#666"
                keyboardType="decimal-pad"
                value={miscAmount}
                onChangeText={setMiscAmount}
              />
              <View style={styles.sourceButtons}>
                <TouchableOpacity
                  style={[styles.sourceButton, miscSource === 'request_lead' && styles.sourceButtonActive]}
                  onPress={() => setMiscSource('request_lead')}
                >
                  <Text style={[styles.sourceButtonText, miscSource === 'request_lead' && styles.sourceButtonTextActive]}>
                    Request Lead
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sourceButton, miscSource === 'refund_protection' && styles.sourceButtonActive]}
                  onPress={() => setMiscSource('refund_protection')}
                >
                  <Text style={[styles.sourceButtonText, miscSource === 'refund_protection' && styles.sourceButtonTextActive]}>
                    Refund Protection
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                placeholder="Description (optional)"
                placeholderTextColor="#666"
                value={miscDescription}
                onChangeText={setMiscDescription}
              />
              <TouchableOpacity style={[styles.modalButton, styles.miscModalButton]} onPress={addMiscIncome}>
                <Text style={styles.modalButtonText}>Add Income</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 16 },
  header: { padding: 20, paddingBottom: 12 },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
  tabBar: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#6366F1' },
  tabText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  activeTabText: { color: '#6366F1' },
  tabContent: { flex: 1, paddingHorizontal: 16 },
  statusBanner: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 16 },
  statusBannerGood: { backgroundColor: '#065F46' },
  statusBannerWarning: { backgroundColor: '#92400E' },
  statusBannerText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 12 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginBottom: 16 },
  statCard: { width: '48%', margin: '1%', backgroundColor: '#1E293B', borderRadius: 12, padding: 16, borderLeftWidth: 4 },
  statHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statTitle: { color: '#94A3B8', fontSize: 12, marginLeft: 8, textTransform: 'uppercase' },
  statValue: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  statGoal: { color: '#64748B', fontSize: 12, marginTop: 4 },
  progressBarContainer: { height: 6, backgroundColor: '#334155', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  statPercent: { fontSize: 12, fontWeight: '600', marginTop: 4, textAlign: 'right' },
  avgTimeCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 12 },
  avgTimeText: { color: '#fff', fontSize: 14, marginLeft: 8 },
  inputSection: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, backgroundColor: '#334155', borderRadius: 8, padding: 12, color: '#fff', fontSize: 16, marginRight: 12 },
  updateButton: { backgroundColor: '#6366F1', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  updateButtonText: { color: '#fff', fontWeight: '600' },
  quickAddSection: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  quickAddButton: { flex: 1, backgroundColor: '#6366F1', borderRadius: 12, padding: 16, alignItems: 'center' },
  bonusButton: { backgroundColor: '#F59E0B' },
  miscButton: { backgroundColor: '#10B981' },
  quickAddText: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 4 },
  nextBonusCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F59E0B' },
  nextBonusTitle: { color: '#F59E0B', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  nextBonusText: { color: '#fff', fontSize: 16 },
  megaBonusText: { color: '#F59E0B', fontSize: 14, fontWeight: 'bold', marginTop: 8 },
  summaryCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  summaryTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { color: '#94A3B8', fontSize: 14 },
  summaryValue: { color: '#fff', fontSize: 14, fontWeight: '500' },
  summaryTotal: { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8, marginTop: 4 },
  summaryTotalLabel: { color: '#fff', fontSize: 16, fontWeight: '600' },
  summaryTotalValue: { color: '#10B981', fontSize: 18, fontWeight: 'bold' },
  recentSection: { marginBottom: 16 },
  bookingItem: { backgroundColor: '#1E293B', borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bookingInfo: { flex: 1 },
  bookingProfit: { color: '#10B981', fontSize: 18, fontWeight: 'bold' },
  bookingTags: { flexDirection: 'row', marginTop: 4, gap: 8 },
  tag: { backgroundColor: '#6366F1', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  tagRefund: { backgroundColor: '#10B981' },
  tagText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  periodHeader: { marginBottom: 16 },
  periodTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  periodDates: { color: '#94A3B8', fontSize: 14, marginTop: 4 },
  earningsCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  earningsTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  earningsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  earningsLabel: { color: '#94A3B8', fontSize: 14 },
  earningsValue: { color: '#fff', fontSize: 14, fontWeight: '500' },
  detailsCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  detailsTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  detailsLabel: { color: '#94A3B8', fontSize: 14, marginLeft: 12, flex: 1 },
  detailsValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bonusAvgCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 16 },
  bonusAvgTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 16 },
  bonusAvgRow: { flexDirection: 'row', justifyContent: 'space-around' },
  bonusAvgItem: { alignItems: 'center' },
  bonusAvgLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  bonusAvgValue: { fontSize: 24, fontWeight: 'bold' },
  bonusAvgGoal: { color: '#64748B', fontSize: 12, marginTop: 4 },
  historyCard: { backgroundColor: '#1E293B', borderRadius: 12, padding: 16, marginBottom: 12 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  historyDate: { color: '#fff', fontSize: 16, fontWeight: '600' },
  historyTotal: { color: '#10B981', fontSize: 18, fontWeight: 'bold' },
  historyStats: { flexDirection: 'row', justifyContent: 'space-between' },
  historyStat: { flexDirection: 'row', alignItems: 'center' },
  historyStatText: { color: '#94A3B8', fontSize: 12, marginLeft: 4 },
  emptyText: { color: '#64748B', fontSize: 14, textAlign: 'center', marginTop: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1E293B', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  modalInput: { backgroundColor: '#334155', borderRadius: 12, padding: 16, color: '#fff', fontSize: 16, marginBottom: 16 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  switchLabel: { color: '#fff', fontSize: 16 },
  modalButton: { backgroundColor: '#6366F1', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  bonusModalButton: { backgroundColor: '#F59E0B' },
  miscModalButton: { backgroundColor: '#10B981' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  sourceButtons: { flexDirection: 'row', marginBottom: 16, gap: 12 },
  sourceButton: { flex: 1, backgroundColor: '#334155', borderRadius: 8, padding: 12, alignItems: 'center' },
  sourceButtonActive: { backgroundColor: '#10B981' },
  sourceButtonText: { color: '#94A3B8', fontSize: 14, fontWeight: '500' },
  sourceButtonTextActive: { color: '#fff' },
  // History Tab Styles
  historyToggle: { 
    flexDirection: 'row', 
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    padding: 4, 
    marginBottom: 16 
  },
  historyToggleBtn: { 
    flex: 1, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    paddingVertical: 10, 
    borderRadius: 8,
    gap: 6,
  },
  historyToggleBtnActive: { backgroundColor: '#6366F1' },
  historyToggleText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  historyToggleTextActive: { color: '#fff' },
  currentPeriodCard: { 
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: '#6366F1' 
  },
  currentPeriodHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  currentPeriodTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  currentPeriodDates: { color: '#94A3B8', fontSize: 14 },
  daysRemainingBadge: { 
    backgroundColor: '#6366F1', 
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 20, 
    alignSelf: 'flex-start', 
    marginTop: 8 
  },
  daysRemainingText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  chartCard: { 
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 16 
  },
  chartTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  chartSubtitle: { color: '#64748B', fontSize: 12, marginBottom: 12 },
  chart: { borderRadius: 8, marginTop: 8 },
  progressRingsContainer: { alignItems: 'center', marginTop: 8 },
  predictionsCard: { 
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: '#F59E0B' 
  },
  predictionsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  predictionsTitle: { color: '#F59E0B', fontSize: 18, fontWeight: '700', marginLeft: 8 },
  predictionsSubtitle: { color: '#94A3B8', fontSize: 12, marginBottom: 16 },
  predictionRow: { flexDirection: 'row', marginBottom: 16 },
  predictionItem: { flex: 1, alignItems: 'center' },
  predictionLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  predictionValue: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  recommendationBox: { 
    flexDirection: 'row', 
    backgroundColor: '#334155', 
    borderRadius: 8, 
    padding: 12, 
    marginTop: 8,
    alignItems: 'flex-start',
    gap: 8,
  },
  recommendationText: { color: '#94A3B8', fontSize: 13, flex: 1, lineHeight: 18 },
  emptyStateCard: { 
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    padding: 40, 
    alignItems: 'center', 
    marginTop: 16 
  },
  emptySubtext: { color: '#64748B', fontSize: 12, textAlign: 'center', marginTop: 8 },
  periodCard: { 
    backgroundColor: '#1E293B', 
    borderRadius: 12, 
    padding: 16, 
    marginBottom: 12 
  },
  periodHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start' 
  },
  periodDates: { color: '#fff', fontSize: 16, fontWeight: '600' },
  periodEntries: { color: '#64748B', fontSize: 12, marginTop: 4 },
  periodRight: { alignItems: 'flex-end' },
  periodEarnings: { color: '#10B981', fontSize: 20, fontWeight: 'bold' },
  completionBadge: { 
    paddingHorizontal: 8, 
    paddingVertical: 4, 
    borderRadius: 12, 
    marginTop: 4 
  },
  completionGood: { backgroundColor: '#065F46' },
  completionWarning: { backgroundColor: '#92400E' },
  completionBehind: { backgroundColor: '#7F1D1D' },
  completionText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  periodDetails: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#334155' },
  periodStatsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  periodStatItem: { 
    width: '25%', 
    alignItems: 'center', 
    paddingHorizontal: 8, 
    marginBottom: 12 
  },
  periodStatLabel: { color: '#64748B', fontSize: 10, marginBottom: 2 },
  periodStatValue: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  periodExtraStats: { marginTop: 8 },
  periodExtraText: { color: '#64748B', fontSize: 11, marginBottom: 4 },
  expandIcon: { alignItems: 'center', marginTop: 8 },
});
