import React, { useMemo, useState } from "react";
import "./Patients.scss";

const Patients = () => {
  const [q, setQ] = useState("");

  const columns = useMemo(
    () => [
      { key: "code", label: "Mã" },
      { key: "name", label: "Tên" },
      { key: "age", label: "Tuổi" },
      { key: "status", label: "Trạng thái" },
      { key: "last_session", label: "Phiên gần nhất" },
    ],
    [],
  );

  const items = useMemo(
    () => [
      {
        id: 1,
        code: "PT-0001",
        name: "Nguyễn Văn A",
        age: 9,
        status: "Đang theo dõi",
        last_session: "25/04/2026 20:10",
      },
      {
        id: 2,
        code: "PT-0002",
        name: "Trần Thị B",
        age: 10,
        status: "Cần đánh giá",
        last_session: "24/04/2026 19:02",
      },
    ],
    [],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) =>
      [it.code, it.name, it.status].some((v) =>
        String(v).toLowerCase().includes(s),
      ),
    );
  }, [items, q]);

  return (
    <div className="clp">
      <div className="clp-header">
        <div>
          <div className="clp-title">Danh sách bệnh nhân</div>
          <div className="clp-subtitle">
            UI placeholder giống `Guardian/Children` — sẽ nối API sau.
          </div>
        </div>
      </div>

      <div className="clp-card clp-filter">
        <div className="clp-card__title">Tìm kiếm</div>
        <label className="clp-field">
          <span className="clp-field__label">Từ khóa</span>
          <input
            className="clp-field__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="VD: PT-0001 / Nguyễn Văn A"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="clp-card">
        <div className="clp-card__title">Kết quả</div>

        {filtered.length === 0 ? (
          <div className="clp-empty">Không có dữ liệu phù hợp.</div>
        ) : (
          <div className="clp-tableWrap">
            <table className="clp-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    {columns.map((c) => (
                      <td key={c.key} title={String(row?.[c.key] ?? "—")}>
                        {row?.[c.key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Patients;

