-- ============================================================
-- Migration 012 — Legal Terms Acknowledgment Gate
-- ============================================================

-- pgcrypto is required for the seed row hash computation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. legal_document_versions ──────────────────────────────

CREATE TABLE legal_document_versions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    version_number   text        NOT NULL,
    title            text        NOT NULL,
    content_markdown text        NOT NULL,
    content_hash     text        NOT NULL,   -- SHA-256 hex of content_markdown
    effective_date   date        NOT NULL,
    published_at     timestamptz NOT NULL DEFAULT now(),
    published_by     uuid        REFERENCES auth.users(id),
    is_active        boolean     NOT NULL DEFAULT false,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (version_number)
);

-- Partial unique index: at most one row may have is_active = true.
CREATE UNIQUE INDEX legal_document_versions_one_active
    ON legal_document_versions (is_active)
    WHERE is_active = true;

-- Fast lookup of the current active version (used on every login).
CREATE INDEX legal_document_versions_active_idx
    ON legal_document_versions (is_active)
    WHERE is_active = true;

-- ── 2. Immutability trigger on legal_document_versions ──────
-- Only is_active may change after insert (to false when deactivated).
-- All other columns are frozen. DELETEs are never permitted.

CREATE OR REPLACE FUNCTION trg_legal_document_versions_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'legal_document_versions rows are immutable and cannot be deleted.';
    END IF;
    -- UPDATE path: guard every column except is_active.
    IF NEW.version_number   IS DISTINCT FROM OLD.version_number   THEN
        RAISE EXCEPTION 'legal_document_versions.version_number is immutable after insert.';
    END IF;
    IF NEW.title            IS DISTINCT FROM OLD.title            THEN
        RAISE EXCEPTION 'legal_document_versions.title is immutable after insert.';
    END IF;
    IF NEW.content_markdown IS DISTINCT FROM OLD.content_markdown THEN
        RAISE EXCEPTION 'legal_document_versions.content_markdown is immutable after insert.';
    END IF;
    IF NEW.content_hash     IS DISTINCT FROM OLD.content_hash     THEN
        RAISE EXCEPTION 'legal_document_versions.content_hash is immutable after insert.';
    END IF;
    IF NEW.effective_date   IS DISTINCT FROM OLD.effective_date   THEN
        RAISE EXCEPTION 'legal_document_versions.effective_date is immutable after insert.';
    END IF;
    IF NEW.published_at     IS DISTINCT FROM OLD.published_at     THEN
        RAISE EXCEPTION 'legal_document_versions.published_at is immutable after insert.';
    END IF;
    IF NEW.published_by     IS DISTINCT FROM OLD.published_by     THEN
        RAISE EXCEPTION 'legal_document_versions.published_by is immutable after insert.';
    END IF;
    IF NEW.created_at       IS DISTINCT FROM OLD.created_at       THEN
        RAISE EXCEPTION 'legal_document_versions.created_at is immutable after insert.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legal_document_versions_immutable
BEFORE UPDATE OR DELETE ON legal_document_versions
FOR EACH ROW EXECUTE FUNCTION trg_legal_document_versions_immutable();

-- ── 3. legal_acknowledgments ────────────────────────────────

CREATE TABLE legal_acknowledgments (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid        NOT NULL REFERENCES auth.users(id),
    version_id       uuid        NOT NULL REFERENCES legal_document_versions(id),
    acknowledged_at  timestamptz NOT NULL DEFAULT now(),
    ip_address       text,
    content_hash     text        NOT NULL,
    UNIQUE (user_id, version_id)
);

-- Primary access pattern: most recent acknowledgment per user.
CREATE INDEX legal_acknowledgments_user_idx
    ON legal_acknowledgments (user_id, acknowledged_at DESC);

-- Support query: all acknowledgments for a specific version.
CREATE INDEX legal_acknowledgments_version_idx
    ON legal_acknowledgments (version_id);

-- ── 4. Immutability trigger on legal_acknowledgments ────────
-- No UPDATE or DELETE is ever permitted on acknowledgment rows.

CREATE OR REPLACE FUNCTION trg_legal_acknowledgments_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'legal_acknowledgments rows are immutable and cannot be deleted.';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'legal_acknowledgments rows are immutable and cannot be updated.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_legal_acknowledgments_immutable
BEFORE UPDATE OR DELETE ON legal_acknowledgments
FOR EACH ROW EXECUTE FUNCTION trg_legal_acknowledgments_immutable();

-- ── 5. RLS policies ─────────────────────────────────────────
-- Service role bypasses RLS. These policies guard direct Supabase REST
-- API access by non-service-role clients.

ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acknowledgments   ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read published versions (so the gate can load).
CREATE POLICY ldv_select ON legal_document_versions
    FOR SELECT TO authenticated USING (true);
-- No INSERT, UPDATE, or DELETE policies for non-service-role clients.

-- Subscribers may only read their own acknowledgment rows.
CREATE POLICY la_select_own ON legal_acknowledgments
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- No UPDATE or DELETE policies defined.
-- INSERT is only performed by the backend using the service role.

-- ── 6. publish_legal_version RPC ────────────────────────────
-- SECURITY DEFINER function so the atomic UPDATE + INSERT runs as the
-- function owner (superuser context) inside a single transaction.

CREATE OR REPLACE FUNCTION publish_legal_version(
    p_version_number   text,
    p_title            text,
    p_content_markdown text,
    p_content_hash     text,
    p_effective_date   date,
    p_published_by     uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_new_id uuid;
BEGIN
    -- Deactivate the current active version (if any).
    UPDATE legal_document_versions
       SET is_active = false
     WHERE is_active = true;

    -- Insert the new active version.
    INSERT INTO legal_document_versions
        (version_number, title, content_markdown, content_hash,
         effective_date, published_at, published_by, is_active)
    VALUES
        (p_version_number, p_title, p_content_markdown, p_content_hash,
         p_effective_date, now(), p_published_by, true)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- ── 7. Seed: version 1.0 ────────────────────────────────────
-- The full text of docs/legal/risk-disclosure-v1.md is inserted as the
-- initial active version. published_by is set to the admin user if present.

INSERT INTO legal_document_versions
    (version_number, title, content_markdown, content_hash,
     effective_date, published_at, published_by, is_active)
VALUES (
    '1.0',
    'Risk Disclosure & Indemnification Agreement',
    $legal_text$# Risk Disclosure & Indemnification Agreement

**Document Version:** 1.0
**Effective Date:** [EFFECTIVE DATE]
**Published By:** [COMPANY NAME]

---

## PLEASE READ THIS AGREEMENT CAREFULLY BEFORE USING THE OPTIONSDESK PLATFORM

This Risk Disclosure & Indemnification Agreement ("Agreement") is a legally binding contract between you ("Subscriber," "you," or "your") and [COMPANY NAME], a company organized under the laws of [STATE] ("Company," "we," "us," or "our"), governing your use of the OptionsDesk platform, including all associated software, services, data feeds, artificial intelligence features, strategy recommendations, and content (collectively, the "Platform").

By clicking "I Agree," checking the acknowledgment box, or by accessing or using the Platform in any manner, you affirm that you are at least 18 years of age, that you have read this Agreement in full, that you understand it, and that you agree to be legally bound by its terms. If you do not agree, you must not access or use the Platform.

---

## SECTION 1 — NOT INVESTMENT ADVICE; NO ADVISORY RELATIONSHIP

### 1.1 Disclaimer Under the Investment Advisers Act of 1940

THE COMPANY IS NOT A REGISTERED INVESTMENT ADVISER, BROKER-DEALER, FINANCIAL PLANNER, OR TAX ADVISER UNDER THE INVESTMENT ADVISERS ACT OF 1940 (15 U.S.C. § 80b-1 ET SEQ.), THE SECURITIES EXCHANGE ACT OF 1934, OR ANY APPLICABLE STATE OR FOREIGN LAW. NOTHING ON THE PLATFORM CONSTITUTES, OR SHOULD BE CONSTRUED AS, INVESTMENT ADVICE, FINANCIAL ADVICE, TRADING ADVICE, OR ANY OTHER TYPE OF PROFESSIONAL ADVICE.

### 1.2 No Advisory Relationship

No communication from the Company, whether through the Platform, email, social media, or any other channel, creates or implies a fiduciary duty, advisory relationship, or professional relationship of any kind between the Company and any Subscriber. The Company does not know your individual financial situation, investment objectives, risk tolerance, tax position, or other personal circumstances, and any output from the Platform has not been tailored to your individual needs.

### 1.3 Informational and Educational Purpose Only

All strategy recommendations, market analyses, implied volatility assessments, options chain data, narrative summaries, AI-generated outputs, and other content provided by the Platform are furnished solely for informational and educational purposes. They are not offers to buy or sell any security, options contract, or other financial instrument. You bear full and exclusive responsibility for any investment or trading decision you make.

---

## SECTION 2 — PAPER TRADING DISCLAIMER

### 2.1 Simulated Environment

THE PLATFORM IS A PAPER-TRADING SIMULATION. No real money, real securities, real options contracts, or real brokerage accounts are involved in any transaction executed on the Platform. "Trades" recorded within the Platform are hypothetical and are used solely to simulate portfolio tracking and educational performance measurement.

### 2.2 Simulated Results Are Not Indicative of Real-World Outcomes

Simulated or hypothetical trading results have inherent limitations. Unlike actual trading, simulated results do not reflect actual market liquidity, slippage, bid-ask spreads, margin requirements, brokerage commissions, tax consequences, or the psychological pressures of real capital at risk. Past simulated performance is not indicative of future real-world results. You acknowledge that the performance of a paper-traded strategy may differ substantially — including adversely — from the same strategy executed with real capital in a live brokerage account.

### 2.3 No Real Brokerage Connection

The Platform does not connect to, interface with, or transmit orders to any real brokerage, clearing firm, exchange, or market. Nothing in the Platform's strategy recommendations should be used as a direct basis for placing real-money trades in a live brokerage account without your own independent analysis, due diligence, and professional advice.

---

## SECTION 3 — AI-GENERATED CONTENT DISCLAIMER

### 3.1 Nature of AI Outputs

The Platform incorporates large language model artificial intelligence technology (the "AI Features"), including but not limited to strategy narratives, market summaries, risk analyses, and conversational outputs. These outputs are generated algorithmically and are subject to the inherent limitations of AI systems, including but not limited to:

(a) Errors, omissions, and factual inaccuracies;
(b) Outdated or stale information;
(c) Hallucinated or fabricated data points;
(d) Misinterpretation of market conditions;
(e) Inability to account for rapidly changing market events.

### 3.2 No Guarantee of Accuracy

The Company makes no representation or warranty, express or implied, that any AI-generated output is accurate, complete, current, reliable, or suitable for any purpose. AI outputs must not be treated as authoritative statements of fact. You are solely responsible for independently verifying any information before acting on it.

### 3.3 Third-Party AI Providers

AI Features may be powered by third-party providers including but not limited to Anthropic, PBC ("Claude API"). The Company does not control, and is not responsible for, the outputs, availability, accuracy, or safety of third-party AI models. Your use of AI Features is also subject to the applicable terms and policies of such third-party providers.

---

## SECTION 4 — MARKET DATA DISCLAIMER

### 4.1 Data Sources and Accuracy

Market data displayed on the Platform, including options chain quotes, implied volatility metrics, Greeks, price histories, and earnings dates, is sourced from third-party data providers including but not limited to api.marketdata.app and Yahoo Finance. This data may be delayed, incomplete, or inaccurate. The Company makes no warranty as to the timeliness, accuracy, or completeness of any market data.

### 4.2 Synthetic Data

Under certain circumstances — including but not limited to data provider outages or quota exhaustion — the Platform may display synthetically generated options data computed via the Black-Scholes options pricing model. Such synthetic data is flagged where technically possible but may not always be clearly distinguished from real market data in all display contexts. You acknowledge this limitation.

---

## SECTION 5 — NO WARRANTIES

### 5.1 Disclaimer of All Warranties

THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTY OF ANY KIND. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE COMPANY EXPRESSLY DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO:

(a) WARRANTIES OF MERCHANTABILITY;
(b) FITNESS FOR A PARTICULAR PURPOSE;
(c) NON-INFRINGEMENT;
(d) ACCURACY, TIMELINESS, OR COMPLETENESS OF DATA OR CONTENT;
(e) UNINTERRUPTED OR ERROR-FREE OPERATION OF THE PLATFORM;
(f) THAT ANY STRATEGY RECOMMENDATION WILL BE PROFITABLE OR WILL NOT RESULT IN LOSS.

### 5.2 No Warranty of Uptime

The Company does not warrant any specific level of platform availability. The Platform may be taken offline for maintenance, may experience outages due to third-party infrastructure failures, or may have features restricted or removed at any time without notice.

---

## SECTION 6 — LIMITATION OF LIABILITY

### 6.1 Exclusion of Consequential Damages

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AGENTS, AFFILIATES, SUCCESSORS, OR ASSIGNS (COLLECTIVELY, "COMPANY PARTIES") BE LIABLE TO YOU FOR ANY:

(a) INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES;
(b) LOSS OF PROFITS, REVENUE, GOODWILL, DATA, OR BUSINESS;
(c) TRADING OR INVESTMENT LOSSES OF ANY KIND, WHETHER PAPER OR REAL;
(d) COST OF SUBSTITUTE SERVICES;

ARISING OUT OF OR RELATING TO YOUR USE OF OR INABILITY TO USE THE PLATFORM, ANY STRATEGY RECOMMENDATION, ANY AI-GENERATED OUTPUT, OR ANY MARKET DATA DISPLAYED, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, STATUTE, OR ANY OTHER LEGAL THEORY, EVEN IF THE COMPANY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

### 6.2 Cap on Direct Damages

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL AGGREGATE LIABILITY OF THE COMPANY PARTIES TO YOU FOR ANY DIRECT DAMAGES ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE PLATFORM SHALL NOT EXCEED THE TOTAL AMOUNT OF SUBSCRIPTION FEES ACTUALLY PAID BY YOU TO THE COMPANY IN THE TWELVE (12) CALENDAR MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR ONE HUNDRED US DOLLARS (USD $100.00), WHICHEVER IS GREATER.

### 6.3 Basis of the Bargain

YOU ACKNOWLEDGE THAT THE LIMITATIONS OF LIABILITY IN THIS SECTION REFLECT A REASONABLE ALLOCATION OF RISK AND ARE AN ESSENTIAL ELEMENT OF THE BASIS OF THE BARGAIN BETWEEN THE COMPANY AND YOU. THE COMPANY WOULD NOT PROVIDE THE PLATFORM TO YOU ABSENT THESE LIMITATIONS.

### 6.4 Jurisdictional Limitations

Some jurisdictions do not allow the exclusion of certain warranties or the limitation or exclusion of liability for certain types of damages. To the extent that any such restrictions apply in your jurisdiction, certain of the foregoing limitations may not apply to you, but shall apply to the maximum extent permitted by applicable law.

---

## SECTION 7 — SUBSCRIBER INDEMNIFICATION

### 7.1 Indemnification Obligation

You agree to defend, indemnify, and hold harmless the Company Parties from and against any and all claims, demands, suits, actions, proceedings, losses, liabilities, damages, judgments, penalties, fines, costs, and expenses (including reasonable attorneys' fees and court costs) ("Claims") arising out of or relating to:

(a) Your use of or access to the Platform;
(b) Any investment or trading decision you make based on, or influenced by, any output from the Platform, whether real-money or paper;
(c) Your violation of any term of this Agreement;
(d) Your violation of any applicable law, regulation, or rule, including securities laws;
(e) Your infringement of any intellectual property or other right of any third party;
(f) Any misrepresentation made by you.

### 7.2 Indemnification Procedure

The Company will promptly notify you in writing of any Claim subject to indemnification; provided that any failure to provide timely notice will not relieve your indemnification obligation except to the extent you are materially prejudiced by such failure. The Company reserves the right, at its own expense, to assume exclusive defense and control of any matter subject to indemnification by you. You agree to cooperate fully with the Company in connection with the defense of any such Claim.

---

## SECTION 8 — TRADING AND INVESTMENT RISKS

You acknowledge and understand that:

(a) **Options trading involves substantial risk of loss.** Options and other derivative instruments are inherently leveraged and can result in losses that exceed the amount invested. Options may expire worthless.

(b) **Past performance does not predict future results.** Historical data, backtested results, and simulated paper-trade performance are not reliable indicators of future real-world returns.

(c) **Market conditions can change rapidly and without warning.** No analytical tool or advisory system can predict the future direction of any market, security, or derivative instrument.

(d) **You are solely responsible for your own due diligence.** Before executing any real-money trade, you should consult a licensed and qualified financial adviser, tax professional, and/or legal counsel with specific knowledge of your individual circumstances.

(e) **You may lose some or all of your invested capital** in any real-money trading activity.

---

## SECTION 9 — DISPUTE RESOLUTION; ARBITRATION; CLASS ACTION WAIVER

### 9.1 Informal Resolution

Before initiating formal dispute proceedings, you agree to first contact the Company in writing at the address or email designated for legal notices and provide a detailed description of your claim. The parties agree to make a good-faith effort to resolve any dispute informally within thirty (30) days of such notice.

### 9.2 Binding Arbitration

EXCEPT AS PROVIDED IN SECTION 9.4, ANY DISPUTE, CLAIM, OR CONTROVERSY ARISING OUT OF OR RELATING TO THIS AGREEMENT, THE PLATFORM, OR THE BREACH, TERMINATION, ENFORCEMENT, INTERPRETATION, OR VALIDITY THEREOF ("DISPUTE") SHALL BE RESOLVED EXCLUSIVELY BY FINAL AND BINDING ARBITRATION. The arbitration shall be conducted by a single arbitrator under the Commercial Arbitration Rules of the American Arbitration Association ("AAA") then in effect, or such other arbitration rules as the parties may mutually agree. The arbitration shall be conducted in [STATE], United States, in the English language. Judgment on the arbitration award may be entered in any court having jurisdiction.

### 9.3 CLASS ACTION WAIVER

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ALL DISPUTES SHALL BE ARBITRATED OR LITIGATED ON AN INDIVIDUAL BASIS ONLY. YOU EXPRESSLY WAIVE ANY RIGHT TO PARTICIPATE IN ANY CLASS ACTION, COLLECTIVE ACTION, MASS ARBITRATION, OR CONSOLIDATED PROCEEDING. THE ARBITRATOR SHALL HAVE NO AUTHORITY TO CONSOLIDATE CLAIMS OR TO AWARD RELIEF TO ANY PERSON OTHER THAN YOU INDIVIDUALLY.

### 9.4 Exceptions to Arbitration

Notwithstanding Section 9.2, either party may seek emergency injunctive or other equitable relief in a court of competent jurisdiction to prevent irreparable harm pending the outcome of arbitration, and this Agreement shall not prevent either party from filing a claim in small claims court for disputes within that court's jurisdiction.

### 9.5 Waiver of Jury Trial

TO THE FULLEST EXTENT PERMITTED BY LAW, EACH PARTY KNOWINGLY, VOLUNTARILY, AND INTENTIONALLY WAIVES ANY RIGHT TO A TRIAL BY JURY IN ANY LEGAL ACTION ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE PLATFORM.

---

## SECTION 10 — GOVERNING LAW AND JURISDICTION

### 10.1 Primary Governing Law

This Agreement shall be governed by and construed in accordance with the laws of the State of [STATE], United States of America, without regard to its conflict of laws provisions.

### 10.2 Fallback for Non-US Jurisdictions

For Subscribers located outside the United States where mandatory local consumer protection or financial services laws impose requirements that cannot be contractually waived, those mandatory provisions shall apply to the minimum extent required by such local law, and this Agreement shall otherwise remain in full force and effect. The parties agree that this Agreement shall be interpreted so as to give maximum effect to the limitation of liability, indemnification, and disclaimer provisions set forth herein consistent with applicable mandatory local law.

### 10.3 Exclusive Jurisdiction for Court Proceedings

To the extent any court proceedings are permitted under this Agreement, the parties consent to the exclusive jurisdiction of the state and federal courts located in [STATE], United States of America, and waive any objection to such jurisdiction on grounds of venue, inconvenient forum, or otherwise.

---

## SECTION 11 — REGULATORY COMPLIANCE; SUBSCRIBER RESPONSIBILITY

You acknowledge that options and derivatives trading may be regulated in your jurisdiction by governmental authorities including but not limited to the U.S. Securities and Exchange Commission, the U.S. Commodity Futures Trading Commission, the Financial Industry Regulatory Authority, and equivalent foreign regulators. It is your sole responsibility to ensure that your use of the Platform, including any paper-trading simulations or real-money trading decisions informed by the Platform, complies with all applicable laws and regulations in your jurisdiction. The Company makes no representation that the Platform is appropriate for use in any specific jurisdiction.

---

## SECTION 12 — INTELLECTUAL PROPERTY

All content, software, algorithms, data models, and materials on the Platform, including but not limited to the 31-strategy catalog, AI narrative outputs, and options analysis methodologies, are the proprietary intellectual property of the Company or its licensors and are protected by applicable intellectual property laws. Nothing in this Agreement grants you any ownership rights in the Platform or its content.

---

## SECTION 13 — PRIVACY

Your use of the Platform is also governed by the Company's Privacy Policy, the terms of which are incorporated herein by reference. In connection with your use of the Platform, the Company collects certain data, including your IP address at the time of acknowledging this Agreement, for the purposes of maintaining a legally valid acknowledgment record. By agreeing to this Agreement, you consent to such data collection.

---

## SECTION 14 — MODIFICATION OF THIS AGREEMENT

### 14.1 Right to Modify

The Company reserves the right to modify this Agreement at any time. When the Company publishes a new version of this Agreement, it will update the Document Version number and Effective Date.

### 14.2 Re-Acknowledgment Requirement

Material modifications to this Agreement will require Subscribers to affirmatively re-acknowledge the updated Agreement before continuing to access the Platform. In the event of a re-acknowledgment requirement, you will be presented with the updated Agreement upon your next login and will not be permitted to access the Platform until you have acknowledged the updated version.

### 14.3 Continued Use

If you do not agree to a modified version of this Agreement, you must cease using the Platform and may terminate your subscription in accordance with the subscription terms.

---

## SECTION 15 — SEVERABILITY

If any provision of this Agreement is held by a court or arbitrator of competent jurisdiction to be invalid, illegal, or unenforceable, such provision shall be modified to the minimum extent necessary to make it enforceable, and the remainder of this Agreement shall continue in full force and effect.

---

## SECTION 16 — ENTIRE AGREEMENT

This Agreement, together with the Privacy Policy and any applicable subscription terms, constitutes the entire agreement between you and the Company with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements, representations, warranties, and understandings, whether written or oral, with respect to such subject matter.

---

## SECTION 17 — CONTACT INFORMATION

For legal notices required under this Agreement, please contact [COMPANY NAME] at the address or email designated for legal notices on the Platform's website or help center.

---

*By acknowledging this Agreement, you confirm that you have read, understood, and agree to be legally bound by each of the terms and conditions set forth above.*

**Document Version:** 1.0
**Effective Date:** [EFFECTIVE DATE]
**Company:** [COMPANY NAME]$legal_text$,
    encode(
        digest(
            $hash_text$# Risk Disclosure & Indemnification Agreement

**Document Version:** 1.0
**Effective Date:** [EFFECTIVE DATE]
**Published By:** [COMPANY NAME]

---

## PLEASE READ THIS AGREEMENT CAREFULLY BEFORE USING THE OPTIONSDESK PLATFORM

This Risk Disclosure & Indemnification Agreement ("Agreement") is a legally binding contract between you ("Subscriber," "you," or "your") and [COMPANY NAME], a company organized under the laws of [STATE] ("Company," "we," "us," or "our"), governing your use of the OptionsDesk platform, including all associated software, services, data feeds, artificial intelligence features, strategy recommendations, and content (collectively, the "Platform").

By clicking "I Agree," checking the acknowledgment box, or by accessing or using the Platform in any manner, you affirm that you are at least 18 years of age, that you have read this Agreement in full, that you understand it, and that you agree to be legally bound by its terms. If you do not agree, you must not access or use the Platform.

---

## SECTION 1 — NOT INVESTMENT ADVICE; NO ADVISORY RELATIONSHIP

### 1.1 Disclaimer Under the Investment Advisers Act of 1940

THE COMPANY IS NOT A REGISTERED INVESTMENT ADVISER, BROKER-DEALER, FINANCIAL PLANNER, OR TAX ADVISER UNDER THE INVESTMENT ADVISERS ACT OF 1940 (15 U.S.C. § 80b-1 ET SEQ.), THE SECURITIES EXCHANGE ACT OF 1934, OR ANY APPLICABLE STATE OR FOREIGN LAW. NOTHING ON THE PLATFORM CONSTITUTES, OR SHOULD BE CONSTRUED AS, INVESTMENT ADVICE, FINANCIAL ADVICE, TRADING ADVICE, OR ANY OTHER TYPE OF PROFESSIONAL ADVICE.

### 1.2 No Advisory Relationship

No communication from the Company, whether through the Platform, email, social media, or any other channel, creates or implies a fiduciary duty, advisory relationship, or professional relationship of any kind between the Company and any Subscriber. The Company does not know your individual financial situation, investment objectives, risk tolerance, tax position, or other personal circumstances, and any output from the Platform has not been tailored to your individual needs.

### 1.3 Informational and Educational Purpose Only

All strategy recommendations, market analyses, implied volatility assessments, options chain data, narrative summaries, AI-generated outputs, and other content provided by the Platform are furnished solely for informational and educational purposes. They are not offers to buy or sell any security, options contract, or other financial instrument. You bear full and exclusive responsibility for any investment or trading decision you make.

---

## SECTION 2 — PAPER TRADING DISCLAIMER

### 2.1 Simulated Environment

THE PLATFORM IS A PAPER-TRADING SIMULATION. No real money, real securities, real options contracts, or real brokerage accounts are involved in any transaction executed on the Platform. "Trades" recorded within the Platform are hypothetical and are used solely to simulate portfolio tracking and educational performance measurement.

### 2.2 Simulated Results Are Not Indicative of Real-World Outcomes

Simulated or hypothetical trading results have inherent limitations. Unlike actual trading, simulated results do not reflect actual market liquidity, slippage, bid-ask spreads, margin requirements, brokerage commissions, tax consequences, or the psychological pressures of real capital at risk. Past simulated performance is not indicative of future real-world results. You acknowledge that the performance of a paper-traded strategy may differ substantially — including adversely — from the same strategy executed with real capital in a live brokerage account.

### 2.3 No Real Brokerage Connection

The Platform does not connect to, interface with, or transmit orders to any real brokerage, clearing firm, exchange, or market. Nothing in the Platform's strategy recommendations should be used as a direct basis for placing real-money trades in a live brokerage account without your own independent analysis, due diligence, and professional advice.

---

## SECTION 3 — AI-GENERATED CONTENT DISCLAIMER

### 3.1 Nature of AI Outputs

The Platform incorporates large language model artificial intelligence technology (the "AI Features"), including but not limited to strategy narratives, market summaries, risk analyses, and conversational outputs. These outputs are generated algorithmically and are subject to the inherent limitations of AI systems, including but not limited to:

(a) Errors, omissions, and factual inaccuracies;
(b) Outdated or stale information;
(c) Hallucinated or fabricated data points;
(d) Misinterpretation of market conditions;
(e) Inability to account for rapidly changing market events.

### 3.2 No Guarantee of Accuracy

The Company makes no representation or warranty, express or implied, that any AI-generated output is accurate, complete, current, reliable, or suitable for any purpose. AI outputs must not be treated as authoritative statements of fact. You are solely responsible for independently verifying any information before acting on it.

### 3.3 Third-Party AI Providers

AI Features may be powered by third-party providers including but not limited to Anthropic, PBC ("Claude API"). The Company does not control, and is not responsible for, the outputs, availability, accuracy, or safety of third-party AI models. Your use of AI Features is also subject to the applicable terms and policies of such third-party providers.

---

## SECTION 4 — MARKET DATA DISCLAIMER

### 4.1 Data Sources and Accuracy

Market data displayed on the Platform, including options chain quotes, implied volatility metrics, Greeks, price histories, and earnings dates, is sourced from third-party data providers including but not limited to api.marketdata.app and Yahoo Finance. This data may be delayed, incomplete, or inaccurate. The Company makes no warranty as to the timeliness, accuracy, or completeness of any market data.

### 4.2 Synthetic Data

Under certain circumstances — including but not limited to data provider outages or quota exhaustion — the Platform may display synthetically generated options data computed via the Black-Scholes options pricing model. Such synthetic data is flagged where technically possible but may not always be clearly distinguished from real market data in all display contexts. You acknowledge this limitation.

---

## SECTION 5 — NO WARRANTIES

### 5.1 Disclaimer of All Warranties

THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTY OF ANY KIND. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE COMPANY EXPRESSLY DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO:

(a) WARRANTIES OF MERCHANTABILITY;
(b) FITNESS FOR A PARTICULAR PURPOSE;
(c) NON-INFRINGEMENT;
(d) ACCURACY, TIMELINESS, OR COMPLETENESS OF DATA OR CONTENT;
(e) UNINTERRUPTED OR ERROR-FREE OPERATION OF THE PLATFORM;
(f) THAT ANY STRATEGY RECOMMENDATION WILL BE PROFITABLE OR WILL NOT RESULT IN LOSS.

### 5.2 No Warranty of Uptime

The Company does not warrant any specific level of platform availability. The Platform may be taken offline for maintenance, may experience outages due to third-party infrastructure failures, or may have features restricted or removed at any time without notice.

---

## SECTION 6 — LIMITATION OF LIABILITY

### 6.1 Exclusion of Consequential Damages

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE COMPANY, ITS OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AGENTS, AFFILIATES, SUCCESSORS, OR ASSIGNS (COLLECTIVELY, "COMPANY PARTIES") BE LIABLE TO YOU FOR ANY:

(a) INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES;
(b) LOSS OF PROFITS, REVENUE, GOODWILL, DATA, OR BUSINESS;
(c) TRADING OR INVESTMENT LOSSES OF ANY KIND, WHETHER PAPER OR REAL;
(d) COST OF SUBSTITUTE SERVICES;

ARISING OUT OF OR RELATING TO YOUR USE OF OR INABILITY TO USE THE PLATFORM, ANY STRATEGY RECOMMENDATION, ANY AI-GENERATED OUTPUT, OR ANY MARKET DATA DISPLAYED, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, STATUTE, OR ANY OTHER LEGAL THEORY, EVEN IF THE COMPANY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

### 6.2 Cap on Direct Damages

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE TOTAL AGGREGATE LIABILITY OF THE COMPANY PARTIES TO YOU FOR ANY DIRECT DAMAGES ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE PLATFORM SHALL NOT EXCEED THE TOTAL AMOUNT OF SUBSCRIPTION FEES ACTUALLY PAID BY YOU TO THE COMPANY IN THE TWELVE (12) CALENDAR MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO THE CLAIM, OR ONE HUNDRED US DOLLARS (USD $100.00), WHICHEVER IS GREATER.

### 6.3 Basis of the Bargain

YOU ACKNOWLEDGE THAT THE LIMITATIONS OF LIABILITY IN THIS SECTION REFLECT A REASONABLE ALLOCATION OF RISK AND ARE AN ESSENTIAL ELEMENT OF THE BASIS OF THE BARGAIN BETWEEN THE COMPANY AND YOU. THE COMPANY WOULD NOT PROVIDE THE PLATFORM TO YOU ABSENT THESE LIMITATIONS.

### 6.4 Jurisdictional Limitations

Some jurisdictions do not allow the exclusion of certain warranties or the limitation or exclusion of liability for certain types of damages. To the extent that any such restrictions apply in your jurisdiction, certain of the foregoing limitations may not apply to you, but shall apply to the maximum extent permitted by applicable law.

---

## SECTION 7 — SUBSCRIBER INDEMNIFICATION

### 7.1 Indemnification Obligation

You agree to defend, indemnify, and hold harmless the Company Parties from and against any and all claims, demands, suits, actions, proceedings, losses, liabilities, damages, judgments, penalties, fines, costs, and expenses (including reasonable attorneys' fees and court costs) ("Claims") arising out of or relating to:

(a) Your use of or access to the Platform;
(b) Any investment or trading decision you make based on, or influenced by, any output from the Platform, whether real-money or paper;
(c) Your violation of any term of this Agreement;
(d) Your violation of any applicable law, regulation, or rule, including securities laws;
(e) Your infringement of any intellectual property or other right of any third party;
(f) Any misrepresentation made by you.

### 7.2 Indemnification Procedure

The Company will promptly notify you in writing of any Claim subject to indemnification; provided that any failure to provide timely notice will not relieve your indemnification obligation except to the extent you are materially prejudiced by such failure. The Company reserves the right, at its own expense, to assume exclusive defense and control of any matter subject to indemnification by you. You agree to cooperate fully with the Company in connection with the defense of any such Claim.

---

## SECTION 8 — TRADING AND INVESTMENT RISKS

You acknowledge and understand that:

(a) **Options trading involves substantial risk of loss.** Options and other derivative instruments are inherently leveraged and can result in losses that exceed the amount invested. Options may expire worthless.

(b) **Past performance does not predict future results.** Historical data, backtested results, and simulated paper-trade performance are not reliable indicators of future real-world returns.

(c) **Market conditions can change rapidly and without warning.** No analytical tool or advisory system can predict the future direction of any market, security, or derivative instrument.

(d) **You are solely responsible for your own due diligence.** Before executing any real-money trade, you should consult a licensed and qualified financial adviser, tax professional, and/or legal counsel with specific knowledge of your individual circumstances.

(e) **You may lose some or all of your invested capital** in any real-money trading activity.

---

## SECTION 9 — DISPUTE RESOLUTION; ARBITRATION; CLASS ACTION WAIVER

### 9.1 Informal Resolution

Before initiating formal dispute proceedings, you agree to first contact the Company in writing at the address or email designated for legal notices and provide a detailed description of your claim. The parties agree to make a good-faith effort to resolve any dispute informally within thirty (30) days of such notice.

### 9.2 Binding Arbitration

EXCEPT AS PROVIDED IN SECTION 9.4, ANY DISPUTE, CLAIM, OR CONTROVERSY ARISING OUT OF OR RELATING TO THIS AGREEMENT, THE PLATFORM, OR THE BREACH, TERMINATION, ENFORCEMENT, INTERPRETATION, OR VALIDITY THEREOF ("DISPUTE") SHALL BE RESOLVED EXCLUSIVELY BY FINAL AND BINDING ARBITRATION. The arbitration shall be conducted by a single arbitrator under the Commercial Arbitration Rules of the American Arbitration Association ("AAA") then in effect, or such other arbitration rules as the parties may mutually agree. The arbitration shall be conducted in [STATE], United States, in the English language. Judgment on the arbitration award may be entered in any court having jurisdiction.

### 9.3 CLASS ACTION WAIVER

TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ALL DISPUTES SHALL BE ARBITRATED OR LITIGATED ON AN INDIVIDUAL BASIS ONLY. YOU EXPRESSLY WAIVE ANY RIGHT TO PARTICIPATE IN ANY CLASS ACTION, COLLECTIVE ACTION, MASS ARBITRATION, OR CONSOLIDATED PROCEEDING. THE ARBITRATOR SHALL HAVE NO AUTHORITY TO CONSOLIDATE CLAIMS OR TO AWARD RELIEF TO ANY PERSON OTHER THAN YOU INDIVIDUALLY.

### 9.4 Exceptions to Arbitration

Notwithstanding Section 9.2, either party may seek emergency injunctive or other equitable relief in a court of competent jurisdiction to prevent irreparable harm pending the outcome of arbitration, and this Agreement shall not prevent either party from filing a claim in small claims court for disputes within that court's jurisdiction.

### 9.5 Waiver of Jury Trial

TO THE FULLEST EXTENT PERMITTED BY LAW, EACH PARTY KNOWINGLY, VOLUNTARILY, AND INTENTIONALLY WAIVES ANY RIGHT TO A TRIAL BY JURY IN ANY LEGAL ACTION ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE PLATFORM.

---

## SECTION 10 — GOVERNING LAW AND JURISDICTION

### 10.1 Primary Governing Law

This Agreement shall be governed by and construed in accordance with the laws of the State of [STATE], United States of America, without regard to its conflict of laws provisions.

### 10.2 Fallback for Non-US Jurisdictions

For Subscribers located outside the United States where mandatory local consumer protection or financial services laws impose requirements that cannot be contractually waived, those mandatory provisions shall apply to the minimum extent required by such local law, and this Agreement shall otherwise remain in full force and effect. The parties agree that this Agreement shall be interpreted so as to give maximum effect to the limitation of liability, indemnification, and disclaimer provisions set forth herein consistent with applicable mandatory local law.

### 10.3 Exclusive Jurisdiction for Court Proceedings

To the extent any court proceedings are permitted under this Agreement, the parties consent to the exclusive jurisdiction of the state and federal courts located in [STATE], United States of America, and waive any objection to such jurisdiction on grounds of venue, inconvenient forum, or otherwise.

---

## SECTION 11 — REGULATORY COMPLIANCE; SUBSCRIBER RESPONSIBILITY

You acknowledge that options and derivatives trading may be regulated in your jurisdiction by governmental authorities including but not limited to the U.S. Securities and Exchange Commission, the U.S. Commodity Futures Trading Commission, the Financial Industry Regulatory Authority, and equivalent foreign regulators. It is your sole responsibility to ensure that your use of the Platform, including any paper-trading simulations or real-money trading decisions informed by the Platform, complies with all applicable laws and regulations in your jurisdiction. The Company makes no representation that the Platform is appropriate for use in any specific jurisdiction.

---

## SECTION 12 — INTELLECTUAL PROPERTY

All content, software, algorithms, data models, and materials on the Platform, including but not limited to the 31-strategy catalog, AI narrative outputs, and options analysis methodologies, are the proprietary intellectual property of the Company or its licensors and are protected by applicable intellectual property laws. Nothing in this Agreement grants you any ownership rights in the Platform or its content.

---

## SECTION 13 — PRIVACY

Your use of the Platform is also governed by the Company's Privacy Policy, the terms of which are incorporated herein by reference. In connection with your use of the Platform, the Company collects certain data, including your IP address at the time of acknowledging this Agreement, for the purposes of maintaining a legally valid acknowledgment record. By agreeing to this Agreement, you consent to such data collection.

---

## SECTION 14 — MODIFICATION OF THIS AGREEMENT

### 14.1 Right to Modify

The Company reserves the right to modify this Agreement at any time. When the Company publishes a new version of this Agreement, it will update the Document Version number and Effective Date.

### 14.2 Re-Acknowledgment Requirement

Material modifications to this Agreement will require Subscribers to affirmatively re-acknowledge the updated Agreement before continuing to access the Platform. In the event of a re-acknowledgment requirement, you will be presented with the updated Agreement upon your next login and will not be permitted to access the Platform until you have acknowledged the updated version.

### 14.3 Continued Use

If you do not agree to a modified version of this Agreement, you must cease using the Platform and may terminate your subscription in accordance with the subscription terms.

---

## SECTION 15 — SEVERABILITY

If any provision of this Agreement is held by a court or arbitrator of competent jurisdiction to be invalid, illegal, or unenforceable, such provision shall be modified to the minimum extent necessary to make it enforceable, and the remainder of this Agreement shall continue in full force and effect.

---

## SECTION 16 — ENTIRE AGREEMENT

This Agreement, together with the Privacy Policy and any applicable subscription terms, constitutes the entire agreement between you and the Company with respect to the subject matter hereof and supersedes all prior and contemporaneous agreements, representations, warranties, and understandings, whether written or oral, with respect to such subject matter.

---

## SECTION 17 — CONTACT INFORMATION

For legal notices required under this Agreement, please contact [COMPANY NAME] at the address or email designated for legal notices on the Platform's website or help center.

---

*By acknowledging this Agreement, you confirm that you have read, understood, and agree to be legally bound by each of the terms and conditions set forth above.*

**Document Version:** 1.0
**Effective Date:** [EFFECTIVE DATE]
**Company:** [COMPANY NAME]$hash_text$,
            'sha256'
        ),
        'hex'
    ),
    '2026-06-14',
    now(),
    (SELECT id FROM auth.users WHERE email = 'leonardsim.sm@gmail.com' LIMIT 1),
    true
);
