;; NFT-AIRDROP (Bitcoin Faces Pattern)
;; Deploy one of these per airdrop campaign.
;; Mint up to 14,995 NFTs per transaction.
;;
;; Based on: https://github.com/bitcoinfaces/airdrop

(impl-trait 'SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.nft-trait.nft-trait)

(define-constant DEPLOYER tx-sender)
(define-constant ERR_UNAUTHORIZED (err u401))
(define-constant ERR_NOT_FOUND (err u404))

(define-data-var nextId uint u1)
(define-data-var baseUri (string-ascii 256) "")
(define-data-var collectionName (string-ascii 64) "Airdrop")

(define-non-fungible-token airdrop-nft uint)

;; SIP-009 Required Functions
(define-read-only (get-last-token-id)
  (ok (- (var-get nextId) u1)))

(define-read-only (get-token-uri (id uint))
  (ok (some (var-get baseUri))))

(define-read-only (get-owner (id uint))
  (ok (nft-get-owner? airdrop-nft id)))

(define-public (transfer (id uint) (from principal) (to principal))
  (begin
    (asserts! (or (is-eq from tx-sender) (is-eq from contract-caller)) ERR_UNAUTHORIZED)
    (nft-transfer? airdrop-nft id from to)))

;; Admin Functions
(define-public (set-base-uri (uri (string-ascii 256)))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR_UNAUTHORIZED)
    (ok (var-set baseUri uri))))

(define-public (set-name (name (string-ascii 64)))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR_UNAUTHORIZED)
    (ok (var-set collectionName name))))

;; Airdrop: Mint to up to 14,995 recipients in one tx
;; Uses three lists: 5000 + 5000 + 4995
(define-public (airdrop
  (l1 (list 5000 principal))
  (l2 (list 5000 principal))
  (l3 (list 4995 principal)))
  (begin
    (asserts! (is-eq tx-sender DEPLOYER) ERR_UNAUTHORIZED)
    (ok (var-set nextId
      (fold mint-to l3
        (fold mint-to l2
          (fold mint-to l1 (var-get nextId))))))))

;; Private: Mint single NFT, return next ID
(define-private (mint-to (recipient principal) (id uint))
  (begin
    (unwrap-panic (nft-mint? airdrop-nft id recipient))
    (+ id u1)))

;; Read-only helpers
(define-read-only (get-collection-info)
  {
    name: (var-get collectionName),
    baseUri: (var-get baseUri),
    totalMinted: (- (var-get nextId) u1)
  })
