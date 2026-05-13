"""Retail Banking synthetic data generator."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from faker import Faker

PRODUCT_TYPES = ("Checking", "Savings", "Mortgage", "CreditCard", "AutoLoan")
SEGMENTS = ("Mass", "MassAffluent", "Affluent", "Wealth")


@dataclass
class BankingParameters:
    tenant_id: str
    start_date: date
    end_date: date
    base_daily_transactions: int = 320
    seed: int = 42
    geographies: tuple[str, ...] = ("NA", "EMEA", "APAC")


@dataclass
class BankingDataset:
    customers: pd.DataFrame
    branches: pd.DataFrame
    products: pd.DataFrame
    accounts: pd.DataFrame
    loans: pd.DataFrame
    transactions: pd.DataFrame

    def all_tables(self) -> dict[str, pd.DataFrame]:
        return {
            "Customers": self.customers,
            "Branches": self.branches,
            "Products": self.products,
            "Accounts": self.accounts,
            "Loans": self.loans,
            "Transactions": self.transactions,
        }


def generate_banking(params: BankingParameters) -> BankingDataset:
    rng = np.random.default_rng(params.seed)
    fake = Faker()
    Faker.seed(params.seed)

    n_branches = 36
    branches = pd.DataFrame(
        {
            "BranchId": np.arange(1, n_branches + 1, dtype=np.int32),
            "BranchName": [f"Branch {i:03d}" for i in range(1, n_branches + 1)],
            "Region": rng.choice(list(params.geographies), size=n_branches, p=_p3()),
            "OpenDate": [
                _rand_date(rng, params.start_date - timedelta(days=10 * 365), params.start_date)
                for _ in range(n_branches)
            ],
            "FteCount": rng.integers(8, 60, size=n_branches, dtype=np.int16),
        }
    )

    n_customers = 6_500
    customers = pd.DataFrame(
        {
            "CustomerId": np.arange(1, n_customers + 1, dtype=np.int32),
            "CustomerName": [fake.unique.name() for _ in range(n_customers)],
            "Segment": rng.choice(list(SEGMENTS), size=n_customers, p=[0.55, 0.25, 0.15, 0.05]),
            "Region": rng.choice(list(params.geographies), size=n_customers, p=_p3()),
            "Tenure_Years": np.round(rng.gamma(shape=2.2, scale=4.0, size=n_customers), 1).astype(np.float32),
            "PrimaryBranchId": rng.integers(1, n_branches + 1, size=n_customers, dtype=np.int32),
            "TenantId": params.tenant_id,
        }
    )

    products = pd.DataFrame(
        {
            "ProductId": np.arange(1, len(PRODUCT_TYPES) + 1, dtype=np.int32),
            "ProductName": list(PRODUCT_TYPES),
            "BaseInterestRate": [0.001, 0.025, 0.062, 0.198, 0.078],
            "ProductGroup": ["Deposit", "Deposit", "Loan", "Loan", "Loan"],
        }
    )

    # Accounts (one or more per customer; mass affluent more accounts on avg).
    seg_to_avg = {"Mass": 1.2, "MassAffluent": 2.1, "Affluent": 3.1, "Wealth": 3.8}
    accounts_per = np.array(
        [rng.poisson(seg_to_avg[s]) + 1 for s in customers["Segment"]]
    ).astype(np.int16)
    n_accounts = int(accounts_per.sum())
    accounts = pd.DataFrame(
        {
            "AccountId": np.arange(1, n_accounts + 1, dtype=np.int64),
            "CustomerId": np.repeat(customers["CustomerId"].to_numpy(), accounts_per),
            "ProductId": rng.choice([1, 2, 4], size=n_accounts, p=[0.55, 0.30, 0.15]).astype(np.int32),
            "Balance": np.round(rng.lognormal(mean=8.5, sigma=1.1, size=n_accounts), 2),
            "OpenDate": [
                _rand_date(rng, params.start_date - timedelta(days=8 * 365), params.end_date)
                for _ in range(n_accounts)
            ],
            "BranchId": rng.integers(1, n_branches + 1, size=n_accounts, dtype=np.int32),
        }
    )

    # Loans (subset of customers, products 3/4/5).
    loan_count = int(n_customers * 0.35)
    loan_customers = rng.choice(customers["CustomerId"].to_numpy(), size=loan_count, replace=False)
    loan_product_ids = rng.choice([3, 4, 5], size=loan_count, p=[0.25, 0.40, 0.35]).astype(np.int32)
    principal = np.round(rng.lognormal(mean=10.2, sigma=0.9, size=loan_count), 2)
    # 30-day non-performing rate ~3.5%, NPL90 ~1.2%.
    status = rng.choice(
        ["Current", "Delinquent30", "Delinquent60", "Delinquent90Plus", "Closed"],
        size=loan_count,
        p=[0.88, 0.05, 0.025, 0.012, 0.033],
    )
    loans = pd.DataFrame(
        {
            "LoanId": np.arange(1, loan_count + 1, dtype=np.int64),
            "CustomerId": loan_customers.astype(np.int32),
            "ProductId": loan_product_ids,
            "Principal": principal,
            "OutstandingBalance": np.round(
                principal * rng.uniform(0.05, 0.98, size=loan_count), 2
            ),
            "InterestRate": np.round(
                rng.uniform(0.025, 0.18, size=loan_count), 4
            ).astype(np.float32),
            "Status": status,
            "OriginationDate": [
                _rand_date(rng, params.start_date - timedelta(days=5 * 365), params.end_date)
                for _ in range(loan_count)
            ],
        }
    )

    # Daily transaction volume w/ payday (weekly) + month-end + holiday spikes.
    days = pd.date_range(params.start_date, params.end_date, freq="D")
    n_days = len(days)
    base = np.full(n_days, float(params.base_daily_transactions))
    dow = np.array([d.dayofweek for d in days])
    dow_mult = np.where(dow == 4, 1.35, np.where(dow >= 5, 0.4, 1.0))  # Fri payday spike
    month_end_mult = np.where(np.array([d.day for d in days]) >= 28, 1.25, 1.0)
    daily_tx = np.maximum(rng.poisson(base * dow_mult * month_end_mult), 1)
    total_tx = int(daily_tx.sum())
    tx_dates = np.repeat(days.values, daily_tx).astype("datetime64[D]")
    account_ids = rng.integers(1, n_accounts + 1, size=total_tx, dtype=np.int64)
    amounts = np.round(rng.lognormal(mean=4.0, sigma=1.1, size=total_tx), 2)
    sign = rng.choice([-1, 1], size=total_tx, p=[0.55, 0.45]).astype(np.int8)
    tx_types = rng.choice(
        ["Debit", "Credit", "Transfer", "Fee"], size=total_tx, p=[0.50, 0.40, 0.07, 0.03]
    )
    transactions = pd.DataFrame(
        {
            "TransactionId": np.arange(1, total_tx + 1, dtype=np.int64),
            "AccountId": account_ids,
            "PostedDate": tx_dates,
            "Amount": amounts * sign,
            "Type": tx_types,
            "Channel": rng.choice(
                ["Branch", "Mobile", "Web", "ATM"], size=total_tx, p=[0.18, 0.42, 0.28, 0.12]
            ),
        }
    )

    return BankingDataset(customers, branches, products, accounts, loans, transactions)


def _p3() -> list[float]:
    return [0.55, 0.30, 0.15]


def _rand_date(rng: np.random.Generator, start: date, end: date) -> datetime:
    span = max((end - start).days, 1)
    offset = int(rng.integers(0, span))
    return datetime.combine(start + timedelta(days=offset), datetime.min.time())
