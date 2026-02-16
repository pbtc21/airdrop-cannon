;; SEND-MANY-FT (SIP-010 Fungible Token Batch Transfers)
;; Template contract — deploy one per token airdrop campaign.
;; Max 14,995 recipients per transaction using 3-list fold pattern.
;;
;; Clarity 4 — uses restrict-assets? for in-contract post conditions.
;; Ensures tx-sender never transfers more tokens than the declared total.
;;
;; DEPLOY INSTRUCTIONS:
;; 1. Replace EVERY occurrence of .token-placeholder with the target SIP-010 contract
;;    e.g. 'SP3NE50GEXFG9SZGTT51P40X2CKYSZ5CC4ZTZ7A2G.welshcorgicoin-token
;; 2. Replace TOKEN_NAME with the define-fungible-token name from that contract
;;    e.g. "welshcorgicoin"
;; 3. Deploy with a unique contract name like send-many-ft-<token>
;;
;; Based on: https://github.com/bitcoinfaces/airdrop

;; ============================================================
;; CUSTOMIZE: token name for post-condition (must match define-fungible-token)
(define-constant TOKEN_NAME "fungible-token")
;; ============================================================

(define-constant DEPLOYER tx-sender)
(define-constant ERR_EMPTY_LISTS (err u400))
(define-constant ERR_POST_CONDITION (err u500))

;; Sender stored before fold (fold helpers can't capture outer scope)
(define-data-var batch-sender principal tx-sender)

;; Batch send FT to up to 14,995 recipients
;; total-amount: sum of all amounts across all three lists (used for post-condition)
;;
;; CUSTOMIZE: replace .token-placeholder in contract-call? and restrict-assets?
(define-public (send-many
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint}))
  (total-amount uint))
  (let (
    (sender tx-sender)
    (count (+ (len l1) (len l2) (len l3)))
  )
    (asserts! (> count u0) ERR_EMPTY_LISTS)
    (var-set batch-sender sender)
    ;; In-contract post condition: sender loses at most total-amount of this FT.
    ;; If actual transfers exceed total-amount, the entire tx rolls back.
    ;; CUSTOMIZE: replace .token-placeholder and TOKEN_NAME below
    (match (restrict-assets? sender
      ((with-ft .token-placeholder TOKEN_NAME total-amount))
      (let (
        (r1 (fold send-ft l1 {ok: u0, fail: u0}))
        (r2 (fold send-ft l2 r1))
        (r3 (fold send-ft l3 r2))
      )
        (print {
          notification: "BatchTransfer",
          payload: {
            sender: sender,
            total-ok: (get ok r3),
            total-fail: (get fail r3),
            total-count: count,
            total-amount: total-amount
          }
        })
        r3
      ))
      result (ok result)
      violation-idx ERR_POST_CONDITION
    )
  )
)

;; Private: transfer FT to a single recipient
;; Fault-tolerant — failures increment fail counter, batch continues
;; CUSTOMIZE: replace .token-placeholder with target SIP-010 contract
(define-private (send-ft
  (entry {to: principal, amount: uint})
  (acc {ok: uint, fail: uint}))
  (let (
    (sender (var-get batch-sender))
  )
    (match (contract-call? .token-placeholder transfer
      (get amount entry) sender (get to entry) none)
      success
        {ok: (+ (get ok acc) u1), fail: (get fail acc)}
      error
        {ok: (get ok acc), fail: (+ (get fail acc) u1)}
    )
  )
)

;; Read-only: Calculate total token amount needed for a batch
(define-read-only (calculate-total
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint})))
  (+ (fold add-amount l1 u0)
     (fold add-amount l2 u0)
     (fold add-amount l3 u0)))

(define-private (add-amount (entry {to: principal, amount: uint}) (total uint))
  (+ total (get amount entry)))

;; Read-only: Get batch info (counts + total amount)
(define-read-only (get-batch-info
  (l1 (list 5000 {to: principal, amount: uint}))
  (l2 (list 5000 {to: principal, amount: uint}))
  (l3 (list 4995 {to: principal, amount: uint})))
  {
    l1-count: (len l1),
    l2-count: (len l2),
    l3-count: (len l3),
    total-count: (+ (len l1) (len l2) (len l3)),
    total-amount: (calculate-total l1 l2 l3)
  })
