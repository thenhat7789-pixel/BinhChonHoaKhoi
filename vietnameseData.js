// Danh sách dữ liệu ngẫu nhiên người bình chọn Việt Nam & Lời chúc
const VIETNAMESE_LAST_NAMES = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng',
  'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Đoàn', 'Mai', 'Trịnh',
  'Đào', 'Cao', 'Hà', 'Lưu', 'Lương', 'Thái', 'Châu', 'Tạ', 'Phùng', 'Tô',
  'Lâm', 'Trương', 'Diệp'
];

const VIETNAMESE_MALE_MIDDLE = [
  'Văn', 'Minh', 'Tuấn', 'Đức', 'Hoàng', 'Quốc', 'Đình', 'Thanh', 'Hữu', 'Thành',
  'Duy', 'Quang', 'Tiến', 'Trọng', 'Bảo', 'Gia', 'Anh', 'Ngọc', 'Phúc', 'Công',
  'Khắc', 'Trí'
];

const VIETNAMESE_MALE_FIRST = [
  'Hùng', 'Dũng', 'Tuấn', 'Nam', 'Long', 'Cường', 'Hải', 'Kiệt', 'Huy', 'Thắng',
  'Đạt', 'Sơn', 'Khoa', 'Phúc', 'Nghĩa', 'Trọng', 'Bách', 'Quân', 'Lâm', 'Toàn',
  'Thịnh', 'Phát', 'Triết', 'Phong', 'Khang', 'Nhân', 'Việt', 'Triều', 'Bảo', 'Tú',
  'Đăng', 'Khôi', 'Nguyên', 'Hưng', 'Kiên'
];

const VIETNAMESE_FEMALE_MIDDLE = [
  'Thị', 'Ngọc', 'Thùy', 'Phương', 'Diệu', 'Quỳnh', 'Kim', 'Thanh', 'Mỹ', 'Khánh',
  'Bích', 'Thu', 'Bảo', 'Hồng', 'Ánh', 'Tuyết', 'Mai', 'Trúc', 'Yến', 'Hoài',
  'Cẩm', 'Tường'
];

const VIETNAMESE_FEMALE_FIRST = [
  'Linh', 'Trang', 'Nga', 'Anh', 'Thảo', 'Hương', 'Uyên', 'Quỳnh', 'Nhi', 'Ngân',
  'Hằng', 'Huyền', 'Vy', 'Dung', 'Chi', 'Mai', 'Trâm', 'Phương', 'Trúc', 'Hà',
  'Lan', 'My', 'Vân', 'Tâm', 'Nhung', 'Diệp', 'Thư', 'Châu', 'Giang', 'Yến',
  'Trinh', 'Đan', 'Ly', 'Quyên', 'Tú'
];

const VIETNAMESE_COMMENTS = [
  'Ủng hộ thí sinh!'
];

const FACULTIES = [
  'Khoa Xây dựng',
  'Khoa Kiến trúc',
  'Khoa Kinh tế & QTKD',
  'Khoa Công nghệ thông tin',
  'Khoa Kỹ thuật Hạ tầng',
  'Khoa Cầu đường',
  'Khoa Cơ khí'
];

const CLASS_PREFIXES = ['D21', 'D22', 'D23', 'D24'];

const CLASS_SUFFIXES = {
  'Khoa Xây dựng': ['XD01', 'XD02', 'XD03'],
  'Khoa Kiến trúc': ['KTR01', 'KTR02'],
  'Khoa Kinh tế & QTKD': ['KT01', 'KT02', 'QT01', 'QT02'],
  'Khoa Công nghệ thông tin': ['CNTT1', 'CNTT2', 'CNTT3'],
  'Khoa Kỹ thuật Hạ tầng': ['HT01', 'HT02'],
  'Khoa Cầu đường': ['CD01', 'CD02'],
  'Khoa Cơ khí': ['CK01', 'CK02']
};

function getRandomVietnameseName() {
  const isFemale = Math.random() < 0.55;
  const lastName = VIETNAMESE_LAST_NAMES[Math.floor(Math.random() * VIETNAMESE_LAST_NAMES.length)];
  if (isFemale) {
    const middle = VIETNAMESE_FEMALE_MIDDLE[Math.floor(Math.random() * VIETNAMESE_FEMALE_MIDDLE.length)];
    const first = VIETNAMESE_FEMALE_FIRST[Math.floor(Math.random() * VIETNAMESE_FEMALE_FIRST.length)];
    return `${lastName} ${middle} ${first}`;
  } else {
    const middle = VIETNAMESE_MALE_MIDDLE[Math.floor(Math.random() * VIETNAMESE_MALE_MIDDLE.length)];
    const first = VIETNAMESE_MALE_FIRST[Math.floor(Math.random() * VIETNAMESE_MALE_FIRST.length)];
    return `${lastName} ${middle} ${first}`;
  }
}

function getRandomVietnameseComment() {
  return VIETNAMESE_COMMENTS[Math.floor(Math.random() * VIETNAMESE_COMMENTS.length)];
}

function getRandomVoterIp() {
  const ipPrefixes = ['14.232', '113.161', '171.244', '42.115', '27.72', '125.235', '116.108', '14.162', '118.69'];
  const ipPrefix = ipPrefixes[Math.floor(Math.random() * ipPrefixes.length)];
  return `${ipPrefix}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
}

module.exports = {
  getRandomVietnameseName,
  getRandomVietnameseComment,
  getRandomVoterIp,
  VIETNAMESE_LAST_NAMES,
  VIETNAMESE_COMMENTS
};
