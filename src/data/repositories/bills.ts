import { supabase } from '../supabaseClient';
import type { Bill } from '../types';
import { firstDueDate, moveDueDay, nextDueAfterPaid } from '../../domain/bills';

export interface BillInput {
  name: string;
  amount: number;
  due_day: number;
}

export async function listBills(): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('recurring_items')
    .select('*')
    .is('archived_at', null)
    .order('next_due_date', { ascending: true });
  if (error) throw error;
  return data as Bill[];
}

export async function createBill(input: BillInput, today: Date = new Date()): Promise<Bill> {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('recurring_items')
    .insert({ ...input, user_id, next_due_date: firstDueDate(input.due_day, today) })
    .select('*')
    .single();
  if (error) throw error;
  return data as Bill;
}

export async function updateBill(bill: Bill, input: BillInput): Promise<Bill> {
  const next_due_date = input.due_day === bill.due_day ? bill.next_due_date : moveDueDay(bill.next_due_date, input.due_day);
  const { data, error } = await supabase
    .from('recurring_items')
    .update({ ...input, next_due_date })
    .eq('id', bill.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Bill;
}

export async function markBillPaid(bill: Bill): Promise<Bill> {
  const { data, error } = await supabase
    .from('recurring_items')
    .update({ next_due_date: nextDueAfterPaid(bill.next_due_date, bill.due_day) })
    .eq('id', bill.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Bill;
}

export async function restoreBillDueDate(bill: Bill): Promise<Bill> {
  const { data, error } = await supabase
    .from('recurring_items')
    .update({ next_due_date: bill.next_due_date })
    .eq('id', bill.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Bill;
}

export async function archiveBill(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_items')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
