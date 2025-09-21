import matplotlib.pyplot as plt
from decimal import Decimal
import numpy as np

def plot_net_pay_and_taxes(
    gross_including_benefits: Decimal,
    net_per_paga: Decimal,
    n_pagues: int,
    cotitzacions_anuals: Decimal,
    irpf_anual: Decimal,
    ss_contingencies_comunes_annual: Decimal,
    t_des_annual: Decimal,
    ss_training_annual: Decimal,
    ss_mei_annual: Decimal,
    return_fig: bool = False
):
    fig, axes = plt.subplots(2, 1, figsize=(7, 12))  # Stack vertically, more mobile friendly
    total_taxes_annual = cotitzacions_anuals + irpf_anual
    net_annual = net_per_paga * Decimal(n_pagues)
    net_vs_taxes_labels = ["Sou Net Anual", "Impostos i Cotitzacions Anuals"]
    net_vs_taxes_values = [float(net_annual), float(total_taxes_annual)]
    colors1 = ["#99ff99", "#ff6666"]
    def autopct_format(pct):
        return ('%1.1f%%' % pct) if pct > 3 else ''
    wedges1, texts1, autotexts1 = axes[0].pie(
        net_vs_taxes_values, autopct=autopct_format, startangle=90, colors=colors1,
        textprops={'fontsize': 18, 'color': 'black'}, pctdistance=0.8, labeldistance=1.15)
    axes[0].set_title("Distribució Sou Net vs Impostos Anuals", fontsize=22, fontweight='bold', pad=20)
    axes[0].legend(net_vs_taxes_labels, loc="upper center", bbox_to_anchor=(0.5, -0.08), fontsize=16, ncol=2)
    for text in texts1 + autotexts1:
        text.set_fontsize(18)
    taxes_breakdown_labels = [
        "IRPF",
        "SS: Contingències Comunes",
        "SS: Atur",
        "SS: Formació Professional",
        "SS: MEI"
    ]
    taxes_breakdown_values = [
        float(irpf_anual),
        float(ss_contingencies_comunes_annual),
        float(t_des_annual),
        float(ss_training_annual),
        float(ss_mei_annual)
    ]
    colors2 = ["#ff9999", "#66b3ff", "#6666ff", "#ffcc99", "#c2c2f0"]
    wedges2, texts2, autotexts2 = axes[1].pie(
        taxes_breakdown_values, autopct=autopct_format, startangle=90, colors=colors2,
        textprops={'fontsize': 18, 'color': 'black'}, pctdistance=0.8, labeldistance=1.15)
    axes[1].set_title("Distribució dels impostos i cotitzacions anuals", fontsize=22, fontweight='bold', pad=20)
    axes[1].legend(taxes_breakdown_labels, loc="upper center", bbox_to_anchor=(0.5, -0.08), fontsize=16, ncol=2)
    for text in texts2 + autotexts2:
        text.set_fontsize(18)
    plt.tight_layout(pad=4.0)
    if return_fig:
        return fig
    else:
        plt.show()

def plot_salary_blocks(
    gross: Decimal,
    n_pagues: int,
    pagues_prorratejades: bool,
    retribucio_en_especie_ann: Decimal,
    grup_cotitzacio: str,
    contract_type: str,
    fam,
    region: str,
    other_deductions: Decimal,
    compute_net_pay,
    return_fig: bool = False
):
    # Dynamic block size
    gross_float = float(gross)
    if gross_float > 1e7:
        raise ValueError("Gross salary too large to plot blocks (max 10M EUR)")
    elif gross_float > 1e6:
        block_size = Decimal("100000")
    elif gross_float > 1e5:
        block_size = Decimal("10000")
    else:
        block_size = Decimal("1000")
    first_block_gross = block_size
    remaining_gross = gross - first_block_gross
    n_remaining_blocks = int(remaining_gross // block_size) + 1 if remaining_gross > 0 else 0
    gross_increments = [first_block_gross] + [first_block_gross + block_size*(i+1) for i in range(n_remaining_blocks)]
    gross_increments[-1] = gross
    net_blocks = []
    taxes_blocks_breakdown = []
    for i, current_gross in enumerate(gross_increments):
        previous_gross = gross_increments[i-1] if i > 0 else Decimal(0)
        current_result = compute_net_pay(
            current_gross,
            n_pagues,
            pagues_prorratejades,
            retribucio_en_especie_ann,
            grup_cotitzacio,
            contract_type,
            other_deductions,
            fam,
            region
        )
        prev_result = compute_net_pay(
            previous_gross,
            n_pagues,
            pagues_prorratejades,
            retribucio_en_especie_ann,
            grup_cotitzacio,
            contract_type,
            other_deductions,
            fam,
            region
        ) if i > 0 else {
            "net_per_paga": Decimal(0),
            "irpf_anual": Decimal(0),
            "ss_contingencies_comunes_monthly": Decimal(0),
            "t_des_monthly": Decimal(0),
            "ss_training_monthly": Decimal(0),
            "ss_mei_monthly": Decimal(0)
        }
        current_net_annual = current_result["net_per_paga"] * Decimal(n_pagues)
        prev_net_annual = prev_result["net_per_paga"] * Decimal(n_pagues)
        if i == 0:
            net_blocks.append(float((current_net_annual - prev_net_annual)))
        else:
            net_blocks.append(float(current_net_annual - prev_net_annual))
        taxes_increment = [
            float(current_result["irpf_anual"] - prev_result["irpf_anual"]),
            float(current_result["ss_contingencies_comunes_monthly"] * Decimal(n_pagues) - prev_result["ss_contingencies_comunes_monthly"] * Decimal(n_pagues)),
            float(current_result["t_des_monthly"] * Decimal(n_pagues) - prev_result["t_des_monthly"] * Decimal(n_pagues)),
            float(current_result["ss_training_monthly"] * Decimal(n_pagues) - prev_result["ss_training_monthly"] * Decimal(n_pagues)),
            float(current_result["ss_mei_monthly"] * Decimal(n_pagues) - prev_result["ss_mei_monthly"] * Decimal(n_pagues))
        ]
        taxes_blocks_breakdown.append(taxes_increment)
    # Make the plot wider and bars thicker, reduce gap
    n_bars = len(net_blocks)
    fig, ax1 = plt.subplots(figsize=(18, 10))  # wide and tall
    bar_width = 0.95
    bar_widths = [bar_width] * n_bars
    bar_positions = [i for i in range(n_bars)]
    tax_colors = ["#ff9999", "#66b3ff", "#6666ff", "#ffcc99", "#c2c2f0"]
    for i in range(n_bars):
        bottom = 0
        ax1.bar(bar_positions[i], net_blocks[i], bar_widths[i], color="#99ff99", label="Sou net" if i==0 else "", edgecolor='black')
        bottom = net_blocks[i]
        for j, tax in enumerate(taxes_blocks_breakdown[i]):
            ax1.bar(bar_positions[i], tax, bar_widths[i], bottom=bottom, color=tax_colors[j],
                    label=["IRPF", "SS: Contingències Comunes", "SS: Atur", "SS: Formació", "SS: MEI"][j] if i==0 else "", edgecolor='black')
            bottom += tax
    ax1.set_xlabel("Blocs de sou brut anual", fontsize=40, labelpad=16)
    ax1.set_ylabel("Euros", fontsize=38, labelpad=16)
    ax1.set_title("Distribució del sou net i impostos", fontsize=38, fontweight='bold', pad=28)
    # X-tick label management
    xtick_labels = [f'{gross_increments[i]:,.0f}' for i in range(len(gross_increments))]
    n_labels = len(xtick_labels)
    max_labels = 12
    if n_labels > max_labels:
        step = (n_labels // max_labels) + 1
        xtick_labels = [label if i % step == 0 or i == n_labels-1 else '' for i, label in enumerate(xtick_labels)]
    ax1.set_xticks(bar_positions)
    ax1.set_xticklabels(xtick_labels, rotation=30, ha="right", fontsize=30)
    ax1.tick_params(axis='y', labelsize=20)
    ax1.grid(axis="y", linestyle="--", alpha=0.5)
    handles, labels = ax1.get_legend_handles_labels()
    by_label = dict(zip(labels, handles))
    # Multi-line legend for long category names
    import textwrap
    wrapped_labels = ["\n".join(textwrap.wrap(lbl, 22)) for lbl in by_label.keys()]
    legend = ax1.legend(by_label.values(), wrapped_labels, loc="upper center", bbox_to_anchor=(0.5, -0.35), fontsize=22, ncol=2, frameon=False)
    # plt.tight_layout(pad=5.0)
    if return_fig:
        return fig
    else:
        plt.show()

def plot_salary_percentages(
    gross: Decimal,
    n_pagues: int,
    pagues_prorratejades: bool,
    retribucio_en_especie_ann: Decimal,
    grup_cotitzacio: str,
    contract_type: str,
    fam,
    region: str,
    other_deductions: Decimal,
    compute_net_pay
):
    step = 1000
    gross_increments = list(range(step, int(gross)+step, step))
    if gross_increments[-1] != gross:
        gross_increments[-1] = int(gross)
    results = []
    for g in gross_increments:
        res = compute_net_pay(
            Decimal(g),
            n_pagues,
            pagues_prorratejades,
            retribucio_en_especie_ann,
            grup_cotitzacio,
            contract_type,
            other_deductions,
            fam,
            region
        )
        net_annual = float(res["net_per_paga"] * Decimal(n_pagues))
        total = float(g)
        breakdown = {
            "gross": g,
            "net": net_annual / total * 100,
            "irpf": float(res["irpf_anual"]) / total * 100,
            "ss_comunes": float(res["ss_contingencies_comunes_monthly"] * Decimal(n_pagues)) / total * 100,
            "ss_atur": float(res["t_des_monthly"] * Decimal(n_pagues)) / total * 100,
            "ss_formacio": float(res["ss_training_monthly"] * Decimal(n_pagues)) / total * 100,
            "ss_mei": float(res["ss_mei_monthly"] * Decimal(n_pagues)) / total * 100,
        }
        results.append(breakdown)
    fig, ax = plt.subplots(figsize=(8, 10))
    x = [r["gross"] for r in results]
    ax.plot(x, [r["net"] for r in results], label="Sou net (%)", linewidth=4, marker='o', markersize=10)
    ax.plot(x, [r["irpf"] for r in results], label="IRPF (%)", linewidth=3, marker='s', markersize=8)
    ax.plot(x, [r["ss_comunes"] for r in results], label="SS: Cont. Comunes (%)", linewidth=3, marker='^', markersize=8)
    ax.plot(x, [r["ss_atur"] for r in results], label="SS: Atur (%)", linewidth=3, marker='D', markersize=8)
    ax.plot(x, [r["ss_formacio"] for r in results], label="SS: Formació (%)", linewidth=3, marker='P', markersize=8)
    ax.plot(x, [r["ss_mei"] for r in results], label="SS: MEI (%)", linewidth=3, marker='X', markersize=8)
    ax.set_xlabel("Sou brut anual (€)", fontsize=18, labelpad=12)
    ax.set_ylabel("Percentatge respecte sou brut", fontsize=18, labelpad=12)
    ax.set_title("Percentatge del sou destinat a cada concepte", fontsize=22, fontweight='bold', pad=20)
    ax.tick_params(axis='x', labelsize=15)
    ax.tick_params(axis='y', labelsize=15)
    ax.grid(True, linestyle="--", alpha=0.5)
    ax.legend(loc="upper left", fontsize=15)
    plt.tight_layout(pad=4.0)
    plt.show()
